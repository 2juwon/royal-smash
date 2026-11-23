const fs=require('fs'),es=require('esbuild');
const r=es.buildSync({entryPoints:[__dirname+'/src/main.js'],bundle:true,minify:true,format:'iife',write:false,target:'es2019',legalComments:'none'});
const js=r.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html=fs.readFileSync(__dirname+'/src/v2.html','utf8').replace('/*BUNDLE*/',()=>js);
fs.writeFileSync(__dirname+'/index.html',html);console.log('ok',(html.length/1024|0)+'KB');
