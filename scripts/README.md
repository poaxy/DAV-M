# Scripts layout

| Directory | Purpose |
|-----------|---------|
| [verify/](./verify/) | Import guards, manifest verification, enterprise smoke checks |
| [bench/](./bench/) | Local performance benchmarks (Phase 2 sandbox, Phase 3 index) |
| [plugins/](./plugins/) | Plugin manifest signing (development) |

Run from the repository root with the package installed (`pip install -e .`) so `dav` imports resolve.

Examples:

```bash
python scripts/verify/verify_core_imports.py
python scripts/verify/verify_enterprise_import.py
python scripts/verify/verify_plugin_manifests.py tests/fixtures/plugin/signed_manifest.json tests/fixtures/plugin/trusted_public.pem
python scripts/bench/bench_sandbox.py
python scripts/bench/bench_phase3.py
```
