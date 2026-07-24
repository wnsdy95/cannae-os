# Runtime Profiles

`moby-seccomp-v0.2.1.json` is a formatting-normalized, semantically exact copy
of Moby Profiles `seccomp/default.json` at commit
`5ad5f40ecde90d78e4a7c861c003fe92747d5518`, signed tag
`seccomp/v0.2.1`.

- Upstream: <https://github.com/moby/profiles>
- Exact source:
  <https://raw.githubusercontent.com/moby/profiles/5ad5f40ecde90d78e4a7c861c003fe92747d5518/seccomp/default.json>
- Upstream raw SHA-256:
  `536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74`
- Local formatted SHA-256:
  `0a72fe3121b8d406a40342c0f5620f229420b2feebe8eab6690a9d4046308f8d`

The source profile is Apache-2.0 licensed. See the upstream repository for its
license and notices. Local formatting changes whitespace only; the fixture
checks both the local byte digest and the research-pinned canonical JSON digest
against the pinned source.

This is a general Docker default-deny profile, not an application-minimal
syscall policy. Cannae OS combines it with all capabilities dropped,
`no_new_privs`, namespaces, read-only mounts, cgroup limits, network isolation,
and direct kernel observation. Do not treat this file alone as a sandbox.
