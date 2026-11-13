import {createClient} from 'npm:@supabase/supabase-js@2.118.0';

const headers = {
 'Access-Control-Allow-Origin': 'https://adriancarrillo1102-bot.github.io',
 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

Deno.serve(async request => {
 const reply = (body: unknown, status = 200) => Response.json(body, {headers, status});
 if (request.method === 'OPTIONS') return new Response(null, {headers});
 if (request.method !== 'POST') return reply({error:'Método no permitido'}, 405);
 const authorization = request.headers.get('Authorization');
 if (!authorization?.startsWith('Bearer ')) return reply({error:'Inicia sesión'}, 401);
 const url = Deno.env.get('SUPABASE_URL')!;
 const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
  global:{headers:{Authorization:authorization}}, auth:{persistSession:false,autoRefreshToken:false},
 });
 const {file_id} = await request.json().catch(() => ({}));
 if (typeof file_id !== 'string' || !/^[\da-f-]{36}$/i.test(file_id)) return reply({error:'Archivo inválido'}, 400);
 const {data, error} = await caller.rpc('gd_publish_replacement', {p_file:file_id});
 if (error) return reply({error:error.message}, 409);
 const storage = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth:{persistSession:false,autoRefreshToken:false},
 }).storage;
 let cleanupPending = false;
 for (const bucket of ['gd-documentos','gd-vistas-pdf']) {
  const paths = data.filter((row: {bucket:string}) => row.bucket === bucket).map((row: {path:string}) => row.path);
  for (let start=0;start<paths.length;start+=100) {
   const result = await storage.from(bucket).remove(paths.slice(start,start+100));
   cleanupPending ||= !!result.error;
  }
 }
 return reply({cleanupPending});
});
