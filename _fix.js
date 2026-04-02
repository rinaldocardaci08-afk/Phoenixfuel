var fs=require('fs'); 
var c=fs.readFileSync('pf-logistica.js','utf8'); 
c=c.split("+ c.data + '").join("+ fmtD(c.data) + '").split("+ carico.data + '").join("+ fmtD(carico.data) + '").split("+ d.data + '").join("+ fmtD(d.data) + '"); 
fs.writeFileSync('pf-logistica.js',c); 
console.log('Done:',c.match(/fmtD/g).length,'sostituzioni'); 
