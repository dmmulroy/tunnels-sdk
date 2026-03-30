import { Effect, FileSystem, Layer, Path, Stdio } from "effect"
import { TestConsole } from "effect/testing"
import { CliOutput } from "effect/unstable/cli"
import { ChildProcessSpawner } from "effect/unstable/process"
import { OutputContext, defaultOutputContext } from "./output.js"

export const TestLayer = Layer.mergeAll(
  TestConsole.layer,
  FileSystem.layerNoop({}),
  Path.layer,
  CliOutput.layer(CliOutput.defaultFormatter({ colors: false })),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("Not implemented"))
  ),
  Stdio.layerTest({}),
  Layer.succeed(OutputContext, defaultOutputContext),
)
