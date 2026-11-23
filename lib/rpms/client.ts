export async function rpmsPost(action:string,p:Record<string,unknown>){
 const response=await fetch('/api/rpms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,action,requestKey:p.requestKey||crypto.randomUUID()})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to save');return data as {id:string;path?:string;token?:string;url?:string};
}
