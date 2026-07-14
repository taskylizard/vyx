# rosepack example

A small but complete Oceanic bot showing flat commands, inferred options, subcommands, subcommand groups, application context, lifecycle hooks, registration, and interaction dispatch.

## Setup

From the repository root:

```sh
vp install
cd examples/rosepack
cp .env.example .env
```

Replace `replace-me` with your Discord bot token. The application must have the `applications.commands` and `bot` scopes when installed.

## Run from source

```sh
vp run start:source
```

For automatic restarts while editing:

```sh
vp run dev
```

## Build with tsdown

Vite+ runs tsdown through `vp pack`:

```sh
vp run build
vp run start
```

The bundled application is written to `dist/index.mjs`.

## Validate

```sh
vp run check
vp run test
vp run build
```

The example owns its package configuration and dependencies, so it can also be copied out of the monorepo after replacing the `workspace:*` rosepack dependency with a published version.
