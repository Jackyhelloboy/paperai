// Read-only deployment diagnostics. Print only non-secret routing/build fields.
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
async function inspect(){
    const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/paperai`,{
        headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error('Could not inspect deployment configuration: '+res.status);
    const body=await res.json();if(!body.success)throw new Error('Deployment inspection failed');
    const p=body.result,c=p.canonical_deployment;
    console.log(JSON.stringify({production_branch:p.production_branch,source_type:p.source?.type,
        automatic_production:p.source?.config?.production_deployments_enabled,
        build:{command:p.build_config?.build_command,output:p.build_config?.destination_dir,root:p.build_config?.root_dir},
        canonical:{url:c?.url,branch:c?.deployment_trigger?.metadata?.branch,commit:c?.deployment_trigger?.metadata?.commit_hash,type:c?.deployment_trigger?.type},
        uses_functions:p.uses_functions}));
    for(const base of ['https://paperai-5up.pages.dev',c?.url].filter(Boolean)){
        const r=await fetch(base+'/local-ocr-check',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
        const text=await r.text();console.log(JSON.stringify({base,status:r.status,location:r.headers.get('Location'),cache:r.headers.get('CF-Cache-Status'),type:r.headers.get('Content-Type'),dashboard:text.includes('Ready to scan'),diagnostic:text.includes('local-ocr-check')}));
    }
}
inspect().catch(error=>{console.error(error.message);process.exitCode=1;});
