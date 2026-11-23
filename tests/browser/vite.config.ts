import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 root:fileURLToPath(new URL('.',import.meta.url)),
 resolve:{alias:{'@':fileURLToPath(new URL('../..',import.meta.url))}},
 oxc:{jsx:{runtime:'automatic'}},
 define:{'process.env':JSON.stringify({NODE_ENV:'development',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-test-key'})},
 server:{host:'127.0.0.1',port:4173,strictPort:true},
});
