from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'public/toc-mainline.user.js'
s=p.read_text()
marker="var PRIVATE_PDF_CAPTURE_REVISION = '20261005-private-pdf-session-v5';"
if marker in s:
    print('private PDF capture already applied'); raise SystemExit(0)
runtime=(root/'scripts/tm-private-pdf-capture.inc.js').read_text().rstrip()+"\n\n"
anchor="  async function finishPairedJob(job,result,trace,token) {\n"
if s.count(anchor)!=1: raise RuntimeError('finishPairedJob anchor mismatch')
s=s.replace(anchor,runtime+anchor,1)
old="""  async function finishPairedJob(job,result,trace,token) {
    if(!currentCaptureJob(job))return Object.assign({},result,{status:'aborted',reason:'manual_run_superseded'});
"""
new="""  async function finishPairedJob(job,result,trace,token) {
    if(!currentCaptureJob(job))return Object.assign({},result,{status:'aborted',reason:'manual_run_superseded'});
    try {
      var privatePdfResult=await maybeCapturePrivatePdf(job,trace);
      if(privatePdfResult)result.privatePdf=privatePdfResult;
    } catch (privatePdfError) {
      var privatePdfReason=String(privatePdfError&&privatePdfError.message||privatePdfError||'private_pdf_failed')
        .replace(/https?:\\/\\/\\S+/gi,'[url]')
        .replace(/[A-Za-z0-9+/_=-]{40,}/g,'[redacted]').slice(0,180);
      result.privatePdf={status:'failed',reason:privatePdfReason};
      if(typeof pushTrace==='function')pushTrace(trace,{stage:'private_pdf_capture',event:'failed',status:'failed',message:privatePdfReason});
    }
"""
if s.count(old)!=1: raise RuntimeError('finishPairedJob body anchor mismatch')
s=s.replace(old,new,1)
call="  installManualRestartListener();\n"
if s.count(call)!=1: raise RuntimeError('install anchor mismatch')
s=s.replace(call,"  installPrivatePdfLeaseReceiver();\n"+call,1)
p.write_text(s)
print('Applied private PDF capture side-channel without changing media queue/status semantics')
