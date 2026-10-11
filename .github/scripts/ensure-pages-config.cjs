// GitHub Actions owns production deployment so an unbuilt Git integration cannot
// overwrite the tested assets. Keep optional preview builds on the same recipe.
async function ensureConfig({fetcher=fetch,token=process.env.CLOUDFLARE_API_TOKEN,
    account=process.env.CLOUDFLARE_ACCOUNT_ID,repository=process.env.GITHUB_REPOSITORY,log=console.log}={}){
    const url=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/paperai`;
    const request=async(method='GET',body)=>{
        const r=await fetcher(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
            body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
        if(!r.ok)throw new Error('Production configuration request failed ('+r.status+')');
        const data=await r.json();if(!data.success)throw new Error('Production configuration was not accepted');
        return data.result;
    };
    let p=await request();
    if(p.source?.type!=='github'){log('Production uses the tested deployment pipeline.');return;}
    const config=p.source.config;
    if((config.owner+'/'+config.repo_name).toLowerCase()!==repository?.toLowerCase())
        throw new Error('Production source does not match this repository; configuration left unchanged.');
    const expected={build_command:'npm ci --prefix frontend --ignore-scripts && node .github/scripts/build-pages.cjs',
        destination_dir:'build/cloudflare-pages',root_dir:''};
    if(config.production_deployments_enabled!==false||Object.entries(expected).some(([k,v])=>p.build_config?.[k]!==v)){
        await request('PATCH',{source:{...p.source,config:{...config,production_deployments_enabled:false}},
            build_config:{...p.build_config,...expected}});
        p=await request();
    }
    if(p.source.config.production_deployments_enabled!==false||Object.entries(expected).some(([k,v])=>p.build_config?.[k]!==v))
        throw new Error('Production build configuration did not persist.');
    log('Production deploys through tested GitHub Actions; optional previews use the same build recipe.');
}
module.exports={ensureConfig};
if(require.main===module)ensureConfig().catch(error=>{console.error(error.message);process.exitCode=1;});
