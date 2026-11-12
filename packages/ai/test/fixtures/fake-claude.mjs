// Stand-in for the `claude` CLI in tests: replays the outputs recorded in spikes S1/S2, never reaches the network.
// The adapter gives the CLI a clean environment, so the scenario comes from `state.json` in FAKE_CLAUDE_DIR, which
// the per-test wrapper (see claude-bin.ts) sets. Every `-p` call is written to `calls.log` (argv and env, CC1/CC3).
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'claude-code')
const dir = process.env.FAKE_CLAUDE_DIR
const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))
const args = process.argv.slice(2)

const recorded = (name) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'))

function readStdin() {
  return new Promise((resolve) => {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (input += chunk))
    process.stdin.on('end', () => resolve(input))
  })
}

// The code the adapter types, then Enter. Like the real CLI (T158), a chunk of several characters is a paste: the
// screen shows it masked and an Enter inside it is text, so only an Enter of its own sends the code.
function readCode() {
  return new Promise((resolve) => {
    let input = ''
    // Raw like the real CLI, so each write arrives as it was sent, not a line at a time.
    process.stdin.setRawMode?.(true)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      if (chunk === '\r' || chunk === '\n') return resolve(input)
      input += chunk
      process.stdout.write('*'.repeat(chunk.length))
    })
  })
}

const hang = () => setInterval(() => undefined, 60_000)

function exit(output) {
  process.stdout.write(output.stdout, () => process.exit(output.exitCode))
}

// The ok.json result, changed into the case the scenario asks for.
function result(changes) {
  const base = JSON.parse(recorded('ok').stdout)
  return JSON.stringify({ ...base, ...changes })
}

async function print() {
  const env = { ...process.env }
  delete env.FAKE_CLAUDE_DIR
  const prompt = await readStdin()
  appendFileSync(join(dir, 'calls.log'), `${JSON.stringify({ argv: args, env, prompt })}\n`)
  const call = readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').length - 1
  // Like the real CLI (2.1.322, T087): a schema that names its draft is refused before anything else, on stderr.
  const schemaAt = args.indexOf('--json-schema')
  if (schemaAt !== -1 && '$schema' in JSON.parse(args[schemaAt + 1])) {
    process.stderr.write(
      'Error: --json-schema is not a valid JSON Schema: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"\n',
      () => process.exit(1),
    )
    return
  }
  const scenario = state.scenarios?.[call] ?? state.scenario ?? 'ok'
  const [type, value] = scenario.split(':')

  switch (type) {
    case 'fixture':
      return exit(recorded(value))
    case 'status':
      return exit({
        exitCode: 1,
        stdout: result({ is_error: true, api_error_status: Number(value), result: `API Error: ${value}` }),
      })
    case 'refusal':
      return exit({ exitCode: 0, stdout: result({ stop_reason: 'refusal', result: '' }) })
    case 'garbage':
      return exit({ exitCode: 1, stdout: 'esto no es JSON' })
    case 'hang':
      return hang()
    case 'output': {
      // The value of `--json-schema` calls comes from `outputs`, one per call.
      const structured = state.outputs[call]
      return exit({
        exitCode: 0,
        stdout: result({ result: JSON.stringify(structured), structured_output: structured }),
      })
    }
    default:
      return exit({ exitCode: 0, stdout: result({ result: state.text ?? 'listo' }) })
  }
}

// `setup-token`: the recorded screen up to the code prompt, then the token once the right code arrives.
async function setupToken() {
  writeFileSync(join(dir, 'login.pid'), String(process.pid))
  writeFileSync(join(dir, 'login.dir'), process.env.CLAUDE_CONFIG_DIR ?? '')
  writeFileSync(join(dir, 'login.browser'), process.env.BROWSER ?? '')
  // Like the real CLI, no terminal type means no colours (T158).
  const recorded = readFileSync(join(fixtures, 'setup-token', 'success.log'), 'latin1')
  // eslint-disable-next-line no-control-regex -- it strips the colours of a terminal
  const log = process.env.TERM ? recorded : recorded.replace(/\x1b\[[0-9;]*m/g, '')
  const cut = log.lastIndexOf('\x1b[?2026h', log.indexOf('Long-lived authentication token created'))
  process.stdout.write(Buffer.from(log.slice(0, cut), 'latin1'))
  if (state.login === 'hang') return hang()
  const code = await readCode()
  appendFileSync(join(dir, 'login.log'), `${JSON.stringify({ code })}\n`)
  if (code !== state.loginCode) {
    // The real CLI stays open after this, waiting for Enter to retry.
    process.stdout.write("\r\nOAuth error: That code wasn't accepted.\r\nPress Enter to retry.\r\n")
    return hang()
  }
  process.stdout.write(Buffer.from(log.slice(cut), 'latin1'), () => process.exit(0))
}

if (args[0] === '--version') {
  process.stdout.write('2.1.312 (Claude Code)\n')
} else if (args[0] === 'setup-token') {
  await setupToken()
} else if (args[0] === '-p') {
  await print()
} else {
  process.stderr.write(`fake-claude: orden desconocida ${args.join(' ')}\n`)
  process.exit(2)
}
