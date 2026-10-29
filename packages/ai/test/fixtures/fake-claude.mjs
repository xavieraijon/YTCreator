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

// One line of the pty: the code the adapter types, ended by Enter.
function readLine() {
  return new Promise((resolve) => {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      input += chunk
      const end = input.search(/[\r\n]/)
      if (end >= 0) resolve(input.slice(0, end))
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
  const log = readFileSync(join(fixtures, 'setup-token', 'success.log'), 'latin1')
  const cut = log.lastIndexOf('\x1b[?2026h', log.indexOf('Long-lived authentication token created'))
  process.stdout.write(Buffer.from(log.slice(0, cut), 'latin1'))
  if (state.login === 'hang') return hang()
  const code = await readLine()
  appendFileSync(join(dir, 'login.log'), `${JSON.stringify({ code })}\n`)
  if (code !== state.loginCode) {
    process.stdout.write('\r\nOAuth error: Invalid code\r\n', () => process.exit(1))
    return
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
