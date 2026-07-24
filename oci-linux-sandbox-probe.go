package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type identitySet struct {
	Real       int `json:"real"`
	Effective  int `json:"effective"`
	Saved      int `json:"saved"`
	Filesystem int `json:"filesystem"`
}

type capabilities struct {
	Inheritable string `json:"inheritable"`
	Permitted   string `json:"permitted"`
	Effective   string `json:"effective"`
	Bounding    string `json:"bounding"`
	Ambient     string `json:"ambient"`
}

type processStatus struct {
	UID            identitySet  `json:"uid"`
	GID            identitySet  `json:"gid"`
	Capabilities   capabilities `json:"capabilities"`
	NoNewPrivs     int          `json:"no_new_privs"`
	SeccompMode    int          `json:"seccomp_mode"`
	SeccompFilters int          `json:"seccomp_filters"`
	NSPid          []int        `json:"nspid"`
}

type mountObservation struct {
	Destination string   `json:"destination"`
	ReadOnly    bool     `json:"read_only"`
	Options     []string `json:"options"`
}

type mountsObservation struct {
	Root                       mountObservation `json:"root"`
	Workspace                  mountObservation `json:"workspace"`
	Tmp                        mountObservation `json:"tmp"`
	WorkspaceRecursiveReadOnly bool             `json:"workspace_recursive_read_only"`
}

type cgroupObservation struct {
	Version   string `json:"version"`
	Path      string `json:"path"`
	MemoryMax string `json:"memory_max"`
	PidsMax   string `json:"pids_max"`
	CPUMax    string `json:"cpu_max"`
}

type outputObservation struct {
	SHA256        string `json:"sha256"`
	ObservedBytes int    `json:"observed_bytes"`
	RetainedBytes int    `json:"retained_bytes"`
	Truncated     bool   `json:"truncated"`
	Base64        string `json:"base64"`
}

type childObservation struct {
	Spawned             bool              `json:"spawned"`
	ExitCode            int               `json:"exit_code"`
	Signal              string            `json:"signal"`
	TerminationReason   string            `json:"termination_reason"`
	TimedOut            bool              `json:"timed_out"`
	OutputLimitExceeded bool              `json:"output_limit_exceeded"`
	Stdout              outputObservation `json:"stdout"`
	Stderr              outputObservation `json:"stderr"`
	StartedAt           string            `json:"started_at"`
	FinishedAt          string            `json:"finished_at"`
}

type rawProbeObservation struct {
	Platform   string            `json:"platform"`
	Status     processStatus     `json:"status"`
	Namespaces map[string]string `json:"namespaces"`
	Mounts     mountsObservation `json:"mounts"`
	Cgroup     cgroupObservation `json:"cgroup"`
	Network    struct {
		Interfaces            []string `json:"interfaces"`
		AddressedInterfaces   []string `json:"addressed_interfaces"`
		NonLoopbackAddresses  []string `json:"non_loopback_addresses"`
		DefaultRouteCount     int      `json:"default_route_count"`
		OutboundConnectDenied bool     `json:"outbound_connect_denied"`
	} `json:"network"`
	WriteTests struct {
		RootDenied      bool `json:"root_denied"`
		WorkspaceDenied bool `json:"workspace_denied"`
		TmpWritable     bool `json:"tmp_writable"`
	} `json:"write_tests"`
	Child       childObservation `json:"child"`
	CollectedAt string           `json:"collected_at"`
}

type limitedBuffer struct {
	mu       sync.Mutex
	max      int
	observed int
	retained bytes.Buffer
	onLimit  func()
}

func (writer *limitedBuffer) Write(input []byte) (int, error) {
	writer.mu.Lock()
	previous := writer.observed
	writer.observed += len(input)
	remaining := writer.max - writer.retained.Len()
	if remaining > 0 {
		retained := input
		if len(retained) > remaining {
			retained = retained[:remaining]
		}
		_, _ = writer.retained.Write(retained)
	}
	exceeded := previous <= writer.max && writer.observed > writer.max
	writer.mu.Unlock()
	if exceeded && writer.onLimit != nil {
		writer.onLimit()
	}
	return len(input), nil
}

func (writer *limitedBuffer) observation() outputObservation {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	retained := append([]byte(nil), writer.retained.Bytes()...)
	sum := sha256.Sum256(retained)
	return outputObservation{
		SHA256:        hex.EncodeToString(sum[:]),
		ObservedBytes: writer.observed,
		RetainedBytes: len(retained),
		Truncated:     writer.observed > len(retained),
		Base64:        base64.StdEncoding.EncodeToString(retained),
	}
}

func readText(filePath string) (string, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(content)), nil
}

func parseFourIntegers(value string) (identitySet, error) {
	parts := strings.Fields(value)
	if len(parts) != 4 {
		return identitySet{}, fmt.Errorf("expected four identity values")
	}
	values := make([]int, 4)
	for index, part := range parts {
		parsed, err := strconv.Atoi(part)
		if err != nil {
			return identitySet{}, err
		}
		values[index] = parsed
	}
	return identitySet{
		Real:       values[0],
		Effective:  values[1],
		Saved:      values[2],
		Filesystem: values[3],
	}, nil
}

func parseIntegerList(value string) ([]int, error) {
	parts := strings.Fields(value)
	values := make([]int, 0, len(parts))
	for _, part := range parts {
		parsed, err := strconv.Atoi(part)
		if err != nil {
			return nil, err
		}
		values = append(values, parsed)
	}
	return values, nil
}

func readProcessStatus() (processStatus, error) {
	content, err := readText("/proc/self/status")
	if err != nil {
		return processStatus{}, err
	}
	fields := map[string]string{}
	for _, line := range strings.Split(content, "\n") {
		key, value, found := strings.Cut(line, ":")
		if found {
			fields[key] = strings.TrimSpace(value)
		}
	}
	uid, err := parseFourIntegers(fields["Uid"])
	if err != nil {
		return processStatus{}, err
	}
	gid, err := parseFourIntegers(fields["Gid"])
	if err != nil {
		return processStatus{}, err
	}
	noNewPrivs, err := strconv.Atoi(fields["NoNewPrivs"])
	if err != nil {
		return processStatus{}, err
	}
	seccomp, err := strconv.Atoi(fields["Seccomp"])
	if err != nil {
		return processStatus{}, err
	}
	filters, err := strconv.Atoi(fields["Seccomp_filters"])
	if err != nil {
		return processStatus{}, err
	}
	nspid, err := parseIntegerList(fields["NSpid"])
	if err != nil || len(nspid) == 0 {
		nspid = []int{os.Getpid()}
	}
	return processStatus{
		UID: uid,
		GID: gid,
		Capabilities: capabilities{
			Inheritable: fields["CapInh"],
			Permitted:   fields["CapPrm"],
			Effective:   fields["CapEff"],
			Bounding:    fields["CapBnd"],
			Ambient:     fields["CapAmb"],
		},
		NoNewPrivs:     noNewPrivs,
		SeccompMode:    seccomp,
		SeccompFilters: filters,
		NSPid:          nspid,
	}, nil
}

func readNamespaces() (map[string]string, error) {
	namespaces := map[string]string{}
	for _, name := range []string{"cgroup", "ipc", "mnt", "net", "pid", "uts"} {
		target, err := os.Readlink(filepath.Join("/proc/self/ns", name))
		if err != nil {
			return nil, err
		}
		namespaces[name] = target
	}
	return namespaces, nil
}

func decodeMountPath(value string) string {
	replacer := strings.NewReplacer(
		`\040`, " ",
		`\011`, "\t",
		`\012`, "\n",
		`\134`, `\`,
	)
	return replacer.Replace(value)
}

func readMount(destination string) (mountObservation, error) {
	content, err := readText("/proc/self/mountinfo")
	if err != nil {
		return mountObservation{}, err
	}
	for _, line := range strings.Split(content, "\n") {
		parts := strings.Fields(line)
		if len(parts) < 10 || decodeMountPath(parts[4]) != destination {
			continue
		}
		separator := -1
		for index, part := range parts {
			if part == "-" {
				separator = index
				break
			}
		}
		if separator < 0 || separator+3 >= len(parts) {
			return mountObservation{}, errors.New("malformed mountinfo")
		}
		mountOptionSet := map[string]bool{}
		for _, option := range strings.Split(parts[5], ",") {
			mountOptionSet[option] = true
		}
		optionSet := map[string]bool{}
		for _, value := range []string{parts[5], parts[separator+3]} {
			for _, option := range strings.Split(value, ",") {
				if !strings.Contains(option, "=") {
					optionSet[option] = true
				}
			}
		}
		options := make([]string, 0, len(optionSet))
		for option := range optionSet {
			options = append(options, option)
		}
		sort.Strings(options)
		return mountObservation{
			Destination: destination,
			ReadOnly:    mountOptionSet["ro"] && !mountOptionSet["rw"],
			Options:     options,
		}, nil
	}
	return mountObservation{}, fmt.Errorf("mount %s not found", destination)
}

func workspaceRecursiveReadOnly() (bool, error) {
	content, err := readText("/proc/self/mountinfo")
	if err != nil {
		return false, err
	}
	for _, line := range strings.Split(content, "\n") {
		parts := strings.Fields(line)
		if len(parts) < 10 {
			continue
		}
		destination := decodeMountPath(parts[4])
		if destination != "/workspace" &&
			!strings.HasPrefix(destination, "/workspace/") {
			continue
		}
		separator := -1
		for index, part := range parts {
			if part == "-" {
				separator = index
				break
			}
		}
		if separator < 0 || separator+3 >= len(parts) {
			return false, errors.New("malformed workspace mountinfo")
		}
		options := map[string]bool{}
		for _, option := range strings.Split(parts[5], ",") {
			options[option] = true
		}
		if options["rw"] || !options["ro"] {
			return false, nil
		}
	}
	return true, nil
}

func cgroupFilePath(cgroupPath string, name string) string {
	clean := filepath.Clean("/" + cgroupPath)
	if clean == "/" {
		return filepath.Join("/sys/fs/cgroup", name)
	}
	return filepath.Join("/sys/fs/cgroup", clean, name)
}

func readCgroup() (cgroupObservation, error) {
	content, err := readText("/proc/self/cgroup")
	if err != nil {
		return cgroupObservation{}, err
	}
	for _, line := range strings.Split(content, "\n") {
		parts := strings.SplitN(line, ":", 3)
		if len(parts) != 3 || parts[0] != "0" || parts[1] != "" {
			continue
		}
		memoryMax, err := readText(cgroupFilePath(parts[2], "memory.max"))
		if err != nil {
			return cgroupObservation{}, err
		}
		pidsMax, err := readText(cgroupFilePath(parts[2], "pids.max"))
		if err != nil {
			return cgroupObservation{}, err
		}
		cpuMax, err := readText(cgroupFilePath(parts[2], "cpu.max"))
		if err != nil {
			return cgroupObservation{}, err
		}
		return cgroupObservation{
			Version:   "2",
			Path:      parts[2],
			MemoryMax: memoryMax,
			PidsMax:   pidsMax,
			CPUMax:    cpuMax,
		}, nil
	}
	return cgroupObservation{}, errors.New("cgroup v2 unified entry not found")
}

func readNetworkInterfaces() ([]string, error) {
	content, err := readText("/proc/net/dev")
	if err != nil {
		return nil, err
	}
	interfaces := []string{}
	for _, line := range strings.Split(content, "\n") {
		name, _, found := strings.Cut(line, ":")
		if !found {
			continue
		}
		name = strings.TrimSpace(name)
		if name != "" {
			interfaces = append(interfaces, name)
		}
	}
	sort.Strings(interfaces)
	return interfaces, nil
}

func readAddressEvidence() ([]string, []string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, nil, err
	}
	addressed := []string{}
	nonLoopback := []string{}
	for _, networkInterface := range interfaces {
		addresses, addressErr := networkInterface.Addrs()
		if addressErr != nil {
			return nil, nil, addressErr
		}
		if len(addresses) > 0 {
			addressed = append(addressed, networkInterface.Name)
		}
		if networkInterface.Flags&net.FlagLoopback == 0 {
			for _, address := range addresses {
				nonLoopback = append(
					nonLoopback,
					networkInterface.Name+"="+address.String(),
				)
			}
		}
	}
	sort.Strings(addressed)
	sort.Strings(nonLoopback)
	return addressed, nonLoopback, nil
}

func defaultRouteCount() (int, error) {
	count := 0
	ipv4, err := readText("/proc/net/route")
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(ipv4, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 8 || fields[1] != "00000000" ||
			fields[7] != "00000000" {
			continue
		}
		flags, parseErr := strconv.ParseUint(fields[3], 16, 64)
		if parseErr == nil && flags&0x1 != 0 && flags&0x200 == 0 {
			count++
		}
	}
	ipv6, err := readText("/proc/net/ipv6_route")
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(ipv6, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 9 &&
			fields[0] == strings.Repeat("0", 32) &&
			fields[1] == "00" {
			flags, parseErr := strconv.ParseUint(fields[8], 16, 64)
			if parseErr != nil || flags&0x1 == 0 || flags&0x200 != 0 {
				continue
			}
			count++
		}
	}
	return count, nil
}

func outboundConnectDenied() bool {
	connection, err := net.DialTimeout(
		"tcp",
		"192.0.2.1:9",
		100*time.Millisecond,
	)
	if err != nil {
		return true
	}
	_ = connection.Close()
	return false
}

func writeDenied(filePath string) bool {
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return true
	}
	_ = file.Close()
	_ = os.Remove(filePath)
	return false
}

func writeAllowed(filePath string) bool {
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return false
	}
	_, writeErr := io.WriteString(file, "probe")
	closeErr := file.Close()
	removeErr := os.Remove(filePath)
	return writeErr == nil && closeErr == nil && removeErr == nil
}

func exitDetails(err error) (int, string) {
	if err == nil {
		return 0, "none"
	}
	var exitError *exec.ExitError
	if !errors.As(err, &exitError) {
		return -1, "none"
	}
	status, ok := exitError.Sys().(syscall.WaitStatus)
	if !ok {
		return exitError.ExitCode(), "none"
	}
	signal := "none"
	if status.Signaled() {
		signal = status.Signal().String()
	}
	return status.ExitStatus(), signal
}

func runChild(
	target string,
	argv []string,
	cwd string,
	timeout time.Duration,
	maxStdout int,
	maxStderr int,
) childObservation {
	startedAt := time.Now().UTC()
	command := exec.Command(target, argv...)
	command.Dir = cwd
	command.Env = []string{}
	command.Stdin = nil
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var reasonMu sync.Mutex
	reason := ""
	terminate := func(value string) {
		reasonMu.Lock()
		defer reasonMu.Unlock()
		if reason != "" {
			return
		}
		reason = value
		if command.Process != nil {
			_ = syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
		}
	}
	stdout := &limitedBuffer{max: maxStdout}
	stderr := &limitedBuffer{max: maxStderr}
	stdout.onLimit = func() { terminate("stdout_limit") }
	stderr.onLimit = func() { terminate("stderr_limit") }
	command.Stdout = stdout
	command.Stderr = stderr

	if err := command.Start(); err != nil {
		finishedAt := time.Now().UTC()
		return childObservation{
			Spawned:           false,
			ExitCode:          -1,
			Signal:            "none",
			TerminationReason: "spawn_error",
			Stdout:            stdout.observation(),
			Stderr:            stderr.observation(),
			StartedAt:         startedAt.Format(time.RFC3339Nano),
			FinishedAt:        finishedAt.Format(time.RFC3339Nano),
		}
	}

	waited := make(chan error, 1)
	go func() {
		waited <- command.Wait()
	}()
	timer := time.NewTimer(timeout)
	var waitErr error
	select {
	case waitErr = <-waited:
		if !timer.Stop() {
			<-timer.C
		}
	case <-timer.C:
		terminate("timeout")
		waitErr = <-waited
	}
	reasonMu.Lock()
	finalReason := reason
	reasonMu.Unlock()
	if finalReason == "" {
		finalReason = "exited"
	}
	exitCode, signal := exitDetails(waitErr)
	finishedAt := time.Now().UTC()
	return childObservation{
		Spawned:             true,
		ExitCode:            exitCode,
		Signal:              signal,
		TerminationReason:   finalReason,
		TimedOut:            finalReason == "timeout",
		OutputLimitExceeded: finalReason == "stdout_limit" || finalReason == "stderr_limit",
		Stdout:              stdout.observation(),
		Stderr:              stderr.observation(),
		StartedAt:           startedAt.Format(time.RFC3339Nano),
		FinishedAt:          finishedAt.Format(time.RFC3339Nano),
	}
}

func supervise(args []string) (rawProbeObservation, error) {
	flags := flag.NewFlagSet("supervise", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	target := flags.String("target", "", "target executable")
	cwd := flags.String("cwd", "", "working directory")
	timeoutMs := flags.Int("timeout-ms", 0, "timeout in milliseconds")
	maxStdout := flags.Int("max-stdout-bytes", 0, "stdout retention limit")
	maxStderr := flags.Int("max-stderr-bytes", 0, "stderr retention limit")
	if err := flags.Parse(args); err != nil {
		return rawProbeObservation{}, err
	}
	if *target == "" || *cwd != "/workspace" || *timeoutMs < 100 ||
		*maxStdout < 1 || *maxStderr < 1 {
		return rawProbeObservation{}, errors.New("invalid supervisor arguments")
	}

	status, err := readProcessStatus()
	if err != nil {
		return rawProbeObservation{}, err
	}
	namespaces, err := readNamespaces()
	if err != nil {
		return rawProbeObservation{}, err
	}
	rootMount, err := readMount("/")
	if err != nil {
		return rawProbeObservation{}, err
	}
	workspaceMount, err := readMount("/workspace")
	if err != nil {
		return rawProbeObservation{}, err
	}
	tmpMount, err := readMount("/tmp")
	if err != nil {
		return rawProbeObservation{}, err
	}
	recursiveReadOnly, err := workspaceRecursiveReadOnly()
	if err != nil {
		return rawProbeObservation{}, err
	}
	cgroup, err := readCgroup()
	if err != nil {
		return rawProbeObservation{}, err
	}
	interfaces, err := readNetworkInterfaces()
	if err != nil {
		return rawProbeObservation{}, err
	}
	addressedInterfaces, nonLoopbackAddresses, err := readAddressEvidence()
	if err != nil {
		return rawProbeObservation{}, err
	}
	routeCount, err := defaultRouteCount()
	if err != nil {
		return rawProbeObservation{}, err
	}

	observation := rawProbeObservation{
		Platform:   "linux",
		Status:     status,
		Namespaces: namespaces,
		Mounts: mountsObservation{
			Root:                       rootMount,
			Workspace:                  workspaceMount,
			Tmp:                        tmpMount,
			WorkspaceRecursiveReadOnly: recursiveReadOnly,
		},
		Cgroup: cgroup,
		Child: runChild(
			*target,
			flags.Args(),
			*cwd,
			time.Duration(*timeoutMs)*time.Millisecond,
			*maxStdout,
			*maxStderr,
		),
	}
	observation.Network.Interfaces = interfaces
	observation.Network.AddressedInterfaces = addressedInterfaces
	observation.Network.NonLoopbackAddresses = nonLoopbackAddresses
	observation.Network.DefaultRouteCount = routeCount
	observation.Network.OutboundConnectDenied = outboundConnectDenied()
	observation.WriteTests.RootDenied = writeDenied("/.cannae-root-write-test")
	observation.WriteTests.WorkspaceDenied =
		writeDenied("/workspace/.cannae-workspace-write-test")
	observation.WriteTests.TmpWritable =
		writeAllowed("/tmp/.cannae-tmp-write-test")
	observation.CollectedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return observation, nil
}

func workload(args []string) int {
	mode := "success"
	if len(args) > 0 {
		mode = args[0]
	}
	if len(os.Environ()) != 0 {
		_, _ = os.Stderr.WriteString("target environment was not empty")
		return 65
	}
	switch mode {
	case "success":
		_, _ = os.Stdout.WriteString("sandbox-workload-ok")
		return 0
	case "fail":
		_, _ = os.Stderr.WriteString("sandbox-workload-failed")
		return 7
	case "sleep":
		time.Sleep(10 * time.Second)
		return 0
	case "stdout-limit":
		_, _ = os.Stdout.Write(bytes.Repeat([]byte("x"), 2*1024*1024))
		return 0
	default:
		_, _ = os.Stderr.WriteString("unknown workload")
		return 64
	}
}

func supervisorExitCode(child childObservation) int {
	switch child.TerminationReason {
	case "timeout":
		return 124
	case "stdout_limit", "stderr_limit":
		return 125
	case "spawn_error":
		return 126
	default:
		if child.ExitCode >= 0 && child.ExitCode <= 125 {
			return child.ExitCode
		}
		return 127
	}
}

func main() {
	if len(os.Args) < 2 {
		_, _ = os.Stderr.WriteString("mode is required\n")
		os.Exit(64)
	}
	switch os.Args[1] {
	case "workload":
		os.Exit(workload(os.Args[2:]))
	case "supervise":
		observation, err := supervise(os.Args[2:])
		if err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "%s\n", err)
			os.Exit(126)
		}
		if err := json.NewEncoder(os.Stdout).Encode(observation); err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "%s\n", err)
			os.Exit(126)
		}
		os.Exit(supervisorExitCode(observation.Child))
	default:
		_, _ = os.Stderr.WriteString("unsupported mode\n")
		os.Exit(64)
	}
}
