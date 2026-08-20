import { openPdf } from "clawpdf";
export async function extractText(buffer:Buffer){const doc=await openPdf(new Uint8Array(buffer));try{const pages=[];for(let i=1;i<=doc.pageCount;i++)pages.push({pageNumber:i,text:doc.page(i).text()});return{pageCount:doc.pageCount,pages};}finally{doc.destroy();}}
