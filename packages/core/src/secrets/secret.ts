const HIDDEN = '[oculto]'

// Wraps a credential so it cannot leak through JSON, strings, logs or inspection (constitution VII).
// Only packages/ai/src and apps/server/src/secrets may call reveal() (ESLint rule).
export class Secret {
  readonly #value: string

  private constructor(value: string) {
    this.#value = value
  }

  static from(value: string): Secret {
    return new Secret(value.trim())
  }

  reveal(): string {
    return this.#value
  }

  hint(): string {
    return this.#value.slice(-4)
  }

  toString(): string {
    return HIDDEN
  }

  toJSON(): string {
    return HIDDEN
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return HIDDEN
  }
}
