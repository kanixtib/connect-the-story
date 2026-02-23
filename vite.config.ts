import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const openaiApiKey = env.OPENAI_API_KEY

  return {
    plugins: [
      react(),
      {
        name: 'api-generate',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const path = req.url?.split('?')[0] ?? ''
            if (path !== '/api/generate' || req.method !== 'POST') return next()
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk })
            req.on('end', async () => {
              if (!openaiApiKey) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }))
                return
              }
              let data: { nodeContent?: string; pathSoFar?: string[] }
              try {
                data = JSON.parse(body)
              } catch {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Invalid JSON body' }))
                return
              }
              const content = typeof data.nodeContent === 'string' ? data.nodeContent : ''
              const pathSoFar = Array.isArray(data.pathSoFar) ? data.pathSoFar : []
              const pathText = pathSoFar.length
                ? `Previous beats:\n${pathSoFar.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n`
                : ''
              const systemPrompt = `You are a narrative writer. Given a story snippet (1-2 sentences), respond with exactly 3 possible continuations. Each continuation must be 1-2 sentences. Keep the same tone and style. Offer distinct directions (different choices, emotions, or plot turns). Respond with valid JSON only: { "continuations": ["first snippet", "second snippet", "third snippet"] }`
              try {
                const OpenAI = require('openai').default
                const openai = new OpenAI({ apiKey: openaiApiKey })
                const completion = await openai.chat.completions.create({
                  model: 'gpt-4o-mini',
                  messages: [
                    { role: 'system', content: systemPrompt },
                    {
                      role: 'user',
                      content: `${pathText}Current moment:\n"${content}"\n\nRespond with JSON only: { "continuations": ["...", "...", "..."] }`,
                    },
                  ],
                  response_format: { type: 'json_object' },
                })
                const raw = completion.choices[0]?.message?.content ?? '{}'
                const parsed = JSON.parse(raw) as { continuations?: string[] }
                const continuations = Array.isArray(parsed.continuations)
                  ? parsed.continuations.slice(0, 3).filter((c): c is string => typeof c === 'string')
                  : []
                if (continuations.length === 0) {
                  res.statusCode = 502
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ error: 'No continuations in model response' }))
                  return
                }
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ continuations }))
              } catch (err) {
                const message = err instanceof Error ? err.message : 'OpenAI request failed'
                res.statusCode = 502
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: message }))
              }
            })
          })
        },
      },
    ],
  }
})
