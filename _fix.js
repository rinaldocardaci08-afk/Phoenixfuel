var fs=require('fs'); 
var c=fs.readFileSync('pf-ordini.js','utf8'); 
var old="r.fornitore + '</span>' + giacenzaHtml"; 
var neu="r.fornitore + '</span>' + (isBest?'':' <span style=\"font-size:10px;color:#A32D2D;font-weight:600\">+'+(prezzoNoIva(r)-prezzoNoIva(best[r.data+'_'+r.prodotto])).toFixed(4)+'</span>') + giacenzaHtml"; 
console.log('Found:',c.indexOf(old)); 
c=c.replace(old,neu); 
fs.writeFileSync('pf-ordini.js',c); 
console.log('DONE'); 
