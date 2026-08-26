import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'api/_utils/**/*.test.ts'],
    /**
     * Capped because the suite was failing at random, and the cause was memory,
     * not the code under test.
     *
     * Vitest defaults to one worker process per CPU — twelve here. Each one
     * loads its own copy of the app, and `internalAccounts.ts` hashes passwords
     * with scrypt, which reserves memory per call by design (N=16384 costs about
     * 16 MB, and it asks for a 64 MB ceiling). On a machine with 8 GB total and
     * often barely 1 GB free, twelve of those together exhaust it: workers get
     * killed mid-run and scrypt itself starts failing with "Deriving bits
     * failed".
     *
     * The symptom was a suite that reported a different number of failures on
     * every run — 7, then 4, then 10 — and a different TOTAL each time (861,
     * 889, 929), because whole files were dying before they could report. Every
     * one of those files passes on its own. Nothing was actually broken.
     *
     * Four workers fit comfortably and the suite still finishes in seconds.
     * Raise this only on a machine with the memory to back it.
     */
    maxWorkers: 4,
  },
})
