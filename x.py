#!/usr/bin/env -S uv run --script
# vim: ft=python
# ruff: noqa: E401, E731

__effect = lambda effect: lambda func: [func, effect(func.__dict__)][0]
cmd = lambda **kw: __effect(lambda d: d.setdefault("@cmd", {}).update(kw))
arg = lambda *a, **kw: __effect(lambda d: d.setdefault("@arg", []).append((a, kw)))
_q = lambda arg: __import__("shlex").quote(str(arg))
__exe = _q(__import__("sys").executable)
_b = lambda s: f"\x1b[96m{s}\x1b[0m"
_sh = lambda *c, **kw: __import__("subprocess").run(
    [
        args := __import__("shlex").split(" ".join(c).replace("\n", " ")),
        print(_b(":: " + " ".join(args))),
    ][0],
    **{
        "check": True,
        "cwd": __import__("pathlib").Path(__file__).parent.resolve(),
        "encoding": "utf-8",
        **kw,
        "env": {**__import__("os").environ, **kw.pop("env", {})},
    },
)


@cmd()
@arg("--seed", action="store_true", help="Run with seeding")
@arg("--migrate", action="store_true", help="Run with migration")
def deploy(seed=False, migrate=False):
    """Deploy the application using Docker Compose."""

    _sh("infisical run --env=prod -- bun apps/bot/src/clear-commands.ts")

    # Login to Infisical
    infisical_token = _sh(
        "infisical login --method=universal-auth "
        f"--client-id={__import__('os').environ['INFISICAL_MACHINE_CLIENT_ID']} "
        f"--client-secret={__import__('os').environ['INFISICAL_MACHINE_CLIENT_SECRET']} "
        "--silent --plain",
        capture_output=True,
        text=True,
    ).stdout.strip()

    env = {"INFISICAL_TOKEN_SERVICE": infisical_token}

    if migrate:
        env["RUN_MIGRATE"] = "true"

    if seed:
        env["RUN_SEED"] = "true"

    # Run docker compose
    _sh(
        "docker compose -f docker-compose.yml up -d --build --remove-orphans",
        env=env,
    )


if __name__ == "__main__":
    _sps = (_p := __import__("argparse").ArgumentParser()).add_subparsers()
    for _f in (f for _, f in sorted(globals().items()) if hasattr(f, "@cmd")):
        _sp = _sps.add_parser(_f.__name__.replace("_", "-"), **getattr(_f, "@cmd"))
        _sp.set_defaults(_=_f)
        [_sp.add_argument(*a, **kw) for a, kw in reversed(getattr(_f, "@arg", []))]
    _a = vars(_p.parse_args())
    fn = _a.pop("_", _p.print_help)
    if __import__("asyncio").iscoroutinefunction(fn):
        __import__("asyncio").run(fn(**_a))
    else:
        fn(**_a)