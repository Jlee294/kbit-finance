import { createClient } from '@supabase/supabase-js'
import { test, expect } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test('viewer không được insert công ty (RLS chặn)', async () => {
  const sb = createClient(url, anon)
  await sb.auth.signInWithPassword({ email: 'viewer@kbit.vn', password: process.env.TEST_VIEWER_PW! })
  const { error } = await sb.from('companies').insert({
    code: 'TESTX',
    name: 'Test Company',
    country: 'VN',
    base_currency: 'VND',
  })
  expect(error).not.toBeNull()
})
