(function(){
  'use strict';
  var queue=Promise.resolve();
  function show(message,value,input){
    var run=function(){return new Promise(function(resolve){
      var previous=document.activeElement,dialog=document.createElement('dialog');
      dialog.dir='rtl';dialog.setAttribute('aria-labelledby','app-dialog-title');
      dialog.style.cssText='border:1px solid #e4e7ef;border-radius:20px;padding:0;width:calc(100% - 32px);max-width:480px;color:#18233e;background:white;font:inherit;';
      var style=document.createElement('style');
      style.textContent='dialog.app-dialog::backdrop{background:rgba(15,23,42,.5)}';
      dialog.className='app-dialog';dialog.appendChild(style);
      var form=document.createElement('form');form.method='dialog';form.style.cssText='padding:24px;display:grid;gap:18px';
      var title=document.createElement('h2');title.id='app-dialog-title';title.textContent=input?'إدخال البيانات':'تأكيد الإجراء';
      title.style.cssText='margin:0;font-size:20px;font-weight:500';form.appendChild(title);
      var label=document.createElement(input?'label':'p');label.textContent=message;
      label.style.cssText='margin:0;line-height:1.8;white-space:pre-wrap';form.appendChild(label);
      var field;
      if(input){
        field=document.createElement('textarea');field.value=value||'';field.rows=3;
        field.id='app-dialog-input';label.htmlFor=field.id;
        field.style.cssText='width:100%;box-sizing:border-box;resize:vertical;border:1px solid #cdd4e1;border-radius:10px;padding:12px;font:inherit;color:inherit;background:white';
        form.appendChild(field);
      }
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
      function button(text,primary){
        var b=document.createElement('button');b.textContent=text;b.type=primary?'submit':'button';
        b.style.cssText='border:1px solid #dce1ea;border-radius:10px;padding:10px 22px;font:inherit;cursor:pointer;background:'+(primary?'#193bdd;color:white':'white;color:#18233e');
        actions.appendChild(b);return b;
      }
      var ok=button(input?'متابعة':'تأكيد',true),cancel=button('إلغاء',false);
      function finish(result){dialog.remove();if(previous&&previous.isConnected)previous.focus({preventScroll:true});resolve(result);}
      form.onsubmit=function(event){event.preventDefault();finish(input?field.value:true);};
      cancel.onclick=function(){finish(input?null:false);};
      dialog.oncancel=function(event){event.preventDefault();finish(input?null:false);};
      form.appendChild(actions);dialog.appendChild(form);document.body.appendChild(dialog);dialog.showModal();
      (field||cancel).focus();
    });};
    var result=queue.then(run);queue=result.then(function(){},function(){});return result;
  }
  window.appPrompt=function(message,value){return show(message,value,true);};
  window.appConfirm=function(message){return show(message,'',false);};
})();
