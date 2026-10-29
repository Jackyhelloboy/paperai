const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),manifest='worker/src/release-manifest.js';
function fingerprint(){
 const files=fs.readdirSync(path.join(root,'worker/src')).filter(n=>n.endsWith('.js')&&n!=='release-manifest.js').map(n=>'worker/src/'+n).concat(['worker/wrangler.toml','frontend/vendor/commons-pictures.js']).sort();
 const hash=crypto.createHash('sha256');for(const file of files)hash.update(file+'\0').update(fs.readFileSync(path.join(root,file))).update('\0');return 'sha256:'+hash.digest('hex');
}
function expected(){return fs.readFileSync(path.join(root,manifest),'utf8').match(/'([^']+)'/)?.[1];}
if(require.main===module){const value=fingerprint();if(process.argv.includes('--check')){if(expected()!==value)throw Error('Worker source changed: regenerate its release fingerprint before deploying.');console.log('Worker source fingerprint matches the checked-in release.');}else fs.writeFileSync(path.join(root,manifest),"export const WORKER_SOURCE_FINGERPRINT = '"+value+"';\n");}
module.exports={fingerprint,expected};
