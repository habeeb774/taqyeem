/* Original UI + Full Neon Services
   Keeps the supplied visual system and overrides only data/auth workflows. */
(function(){
  'use strict';

  var A=window.TAQYEEM_APP={
    data:null,permissions:[],roles:[],cycle:null,cycleData:null,admin:null,users:null,
    criteriaCache:{},evaluationIds:{},evaluationStatus:{},setupRequired:false,loginBusy:false,
    reviewItems:[],notifications:[],portal:null
  };

  function can(code){return A.permissions.indexOf(code)>=0;}
  function role(code){return A.roles.some(function(r){return r.code===code;});}
  function json(v){try{return JSON.stringify(v);}catch(e){return '{}';}}
  function q(v){return String(v==null?'':v);}
  function h(s){return esc(String(s==null?'':s));}
  // Encode JavaScript string arguments for inline HTML event attributes.
  // UUIDs contain hyphens but JSON quotes must still be entity-escaped or the
  // browser truncates the onclick attribute before the handler can run.
  function idjs(v){return JSON.stringify(String(v)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function currentCycleId(){return A.cycle&&A.cycle.id?A.cycle.id:null;}
  function cyclePref(){try{return sessionStorage.getItem('taqyeem_cycle_id')||'';}catch(e){return '';}}
  function saveCyclePref(id){try{if(id)sessionStorage.setItem('taqyeem_cycle_id',String(id));}catch(e){}}
  function cycleLabel(c){return (c.name||('تقييم '+(MONTHS[Number(c.month)-1]||'')+' '+c.year))+' · '+(c.status||'');}
  function latestCycle(){var cs=(A.data&&A.data.cycles||[]).slice();if(!cs.length)return null;var preferred=cs.find(function(c){return ['open','in_progress'].indexOf(c.status)>=0;});return preferred||cs[0];}
  function renderCyclePicker(){
    var wrap=$('cyclePicker'),sel=$('cycleSelect'),cs=(A.data&&A.data.cycles||[]);
    if(!wrap||!sel)return;
    if(!can('evaluations.view')||!cs.length){wrap.style.display='none';return;}
    sel.innerHTML=cs.map(function(c){return '<option value="'+h(c.id)+'">'+h(cycleLabel(c))+'</option>';}).join('');
    if(A.cycle)sel.value=String(A.cycle.id);
    wrap.style.display='flex';
    if(!sel.dataset.bound){sel.dataset.bound='1';sel.addEventListener('change',function(){var c=cs.find(function(x){return String(x.id)===String(sel.value);});if(c)selectCycle(c);});}
  }
  function empById(id){return allE.find(function(e){return String(e.id)===String(id);});}
  function serverEmployeeById(id){return (A.data&&A.data.employees||[]).find(function(e){return String(e.id)===String(id);});}
  function setting(key,def){var v=A.data&&A.data.settings?A.data.settings[key]:undefined;return v===undefined||v===null?def:v;}
  function humanError(code){
    var m={
      INVALID_CREDENTIALS:'البريد الإلكتروني أو كلمة المرور غير صحيحة',RATE_LIMITED:'محاولات كثيرة، حاول بعد 15 دقيقة',
      ACCOUNT_NOT_READY:'الحساب موجود لكنه لم يُربط بالمنشأة والصلاحيات بعد',PROFILE_NOT_READY:'الحساب غير مهيأ بالكامل',
      UNAUTHENTICATED:'انتهت الجلسة، سجّل الدخول مرة أخرى',FORBIDDEN:'ليست لديك صلاحية لتنفيذ هذا الإجراء',permission_denied:'ليست لديك صلاحية لتنفيذ هذا الإجراء',
      ASSIGNMENT_NOT_FOUND:'هذا الموظف غير مسند لك في دورة التقييم الحالية',assignment_not_found:'هذا الموظف غير مسند لك في دورة التقييم الحالية',
      evaluation_incomplete:'أكمل جميع معايير التقييم أولاً',required_comment_missing:'هناك معيار يتطلب ملاحظة قبل الإرسال',
      evaluation_not_editable:'تم إرسال التقييم ولا يمكن تعديله قبل إعادة فتحه',invalid_transition:'لا يمكن تنفيذ هذا الانتقال في حالة التقييم الحالية',
      cycle_not_found:'دورة التقييم غير موجودة',target_change_reason_required:'اذكر سبب تعديل الهدف المطلوب',
      JOB_TITLE_NOT_FOUND:'المسمى الوظيفي غير موجود',SETUP_REQUIRED:'يلزم إنشاء حساب مدير النظام أولاً',SETUP_ALREADY_COMPLETED:'تمت تهيئة المدير الأول مسبقاً',
      ORGANIZATION_NOT_FOUND:'لم يتم العثور على منشأة السويد',INVALID_INPUT:'تحقق من البيانات المدخلة'
    };
    return m[code]||String(code||'حدث خطأ غير متوقع');
  }
  async function api(url,opts){
    var o=Object.assign({credentials:'same-origin',cache:'no-store'},opts||{});
    if(o.body&&typeof o.body!=='string'){o.headers=Object.assign({'content-type':'application/json'},o.headers||{});o.body=JSON.stringify(o.body);}
    var r=await fetch(url,o),j={};try{j=await r.json();}catch(e){}
    if(!r.ok||j.ok===false){var er=new Error(j.error||('HTTP_'+r.status));er.status=r.status;er.payload=j;throw er;}
    return j;
  }
  function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.old=btn.textContent;btn.disabled=true;btn.textContent=label||'جارٍ الحفظ...';}else{btn.disabled=false;btn.textContent=btn.dataset.old||btn.textContent;}}

  /* ---------- Login: email + password only ---------- */
  function buildLoginUI(){
    var sh=$('lgSheet');if(!sh)return;
    sh.classList.remove('s2');
    sh.innerHTML=''+
      '<div class="lg-pane" style="padding:24px 30px 26px;position:absolute;inset:0">'+
        '<div class="lg-eyebrow" style="padding:0 0 18px">تسجيل الدخول</div>'+ 
        '<label class="lg-lbl">البريد الإلكتروني</label>'+ 
        '<input class="em-inp" style="padding:0 14px;margin-bottom:14px;direction:ltr;text-align:left" id="lgEmail" type="email" autocomplete="username" placeholder="name@company.com" />'+
        '<label class="lg-lbl">كلمة المرور</label>'+ 
        '<input class="em-inp" style="padding:0 14px;direction:ltr;text-align:left" id="lgPassword" type="password" autocomplete="current-password" placeholder="••••••••" />'+
        '<div class="lg-err" id="lerr2"></div>'+ 
        '<div class="lg-hint" id="authHint">استخدم البريد الإلكتروني وكلمة المرور الخاصة بحسابك</div>'+ 
        '<button class="lg-go" id="authGo" onclick="doLogin()">دخول</button>'+ 
        '<button type="button" class="lg-link" onclick="buildResetRequestUI()">نسيت كلمة المرور؟</button>'+ 
      '</div>';
    var pass=$('lgPassword');if(pass)pass.addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});
    var email=$('lgEmail');if(email)email.addEventListener('keydown',function(e){if(e.key==='Enter')$('lgPassword').focus();});
  }
  window.buildResetRequestUI=function(){var sh=$('lgSheet');if(!sh)return;sh.innerHTML='<div class="lg-pane" style="padding:24px 30px 26px;position:absolute;inset:0"><div class="lg-eyebrow" style="padding:0 0 18px">استعادة كلمة المرور</div><label class="lg-lbl">البريد الإلكتروني</label><input class="em-inp" style="padding:0 14px;direction:ltr;text-align:left" id="resetEmail" type="email" placeholder="name@company.com" /><div class="lg-err" id="lerr2"></div><div class="lg-hint">سنرسل رابط الاستعادة إذا كان البريد مسجلًا.</div><button class="lg-go" id="authGo" onclick="requestPasswordReset()">إرسال الرابط</button><button type="button" class="lg-link" onclick="buildLoginUI()">العودة لتسجيل الدخول</button></div>';};
  window.buildResetFormUI=function(token){var sh=$('lgSheet');if(!sh)return;sh.innerHTML='<div class="lg-pane" style="padding:24px 30px 26px;position:absolute;inset:0"><div class="lg-eyebrow" style="padding:0 0 18px">تعيين كلمة مرور جديدة</div><label class="lg-lbl">كلمة المرور الجديدة</label><input class="em-inp" style="padding:0 14px;direction:ltr;text-align:left" id="newPassword" type="password" minlength="8" placeholder="8 أحرف على الأقل" /><div class="lg-err" id="lerr2"></div><button class="lg-go" id="authGo" onclick="submitPasswordReset()">حفظ كلمة المرور</button><button type="button" class="lg-link" onclick="buildLoginUI()">العودة لتسجيل الدخول</button></div>';window._resetToken=token;};
  window.submitPasswordReset=async function(){var p=q($('newPassword')&&$('newPassword').value),err=$('lerr2'),btn=$('authGo');if(p.length<8){err.textContent='كلمة المرور يجب ألا تقل عن 8 أحرف';err.classList.add('show');return;}busy(btn,true,'جارٍ الحفظ...');try{await api('/api/app/auth/password-reset',{method:'POST',body:{action:'reset',token:window._resetToken,new_password:p}});err.textContent='تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.';err.classList.add('show');setTimeout(buildLoginUI,1200);}catch(e){err.textContent='الرابط غير صالح أو منتهي';err.classList.add('show');}finally{busy(btn,false);}};
  window.requestPasswordReset=async function(){var email=q($('resetEmail')&&$('resetEmail').value).trim().toLowerCase(),err=$('lerr2'),btn=$('authGo');if(email.indexOf('@')<1){err.textContent='أدخل بريدًا صحيحًا';err.classList.add('show');return;}busy(btn,true,'جارٍ الإرسال...');try{await api('/api/app/auth/password-reset',{method:'POST',body:{email:email}});err.textContent='إذا كان البريد مسجلًا، سيصلك رابط الاستعادة.';err.classList.add('show');}catch(e){err.textContent='تعذر إرسال الرابط';err.classList.add('show');}finally{busy(btn,false);}};
  window.doFirstSetup=async function(){
    var name=q($('setupName')&&$('setupName').value).trim(),email=q($('setupEmail')&&$('setupEmail').value).trim().toLowerCase(),password=q($('setupPassword')&&$('setupPassword').value),err=$('lerr2'),btn=$('authGo');
    if(name.length<2||email.indexOf('@')<1||password.length<8){err.textContent='أكمل الاسم والبريد وكلمة مرور من 8 أحرف على الأقل';err.classList.add('show');return;}
    busy(btn,true,'جارٍ إنشاء المدير...');
    try{await api('/api/app/auth/setup',{method:'POST',body:{full_name:name,email:email,password:password}});A.setupRequired=false;buildLoginUI();var e=$('lgEmail');if(e)e.value=email;toast('تم إنشاء مدير النظام. سجّل الدخول الآن.');}
    catch(e){err.textContent=humanError(e.message);err.classList.add('show');}
    finally{busy(btn,false);}
  };
  function buildSetupUI(){
    var sh=$('lgSheet');if(!sh)return;sh.classList.remove('s2');
    sh.innerHTML=''+
      '<div class="lg-pane" style="padding:24px 30px 26px;position:absolute;inset:0">'+
      '<div class="lg-eyebrow" style="padding:0 0 18px">تهيئة مدير النظام لأول مرة</div>'+
      '<label class="lg-lbl">الاسم</label><input class="em-inp" style="padding:0 14px;margin-bottom:12px" id="setupName" autocomplete="name" placeholder="مدير النظام" />'+
      '<label class="lg-lbl">البريد الإلكتروني</label><input class="em-inp" style="padding:0 14px;margin-bottom:12px;direction:ltr;text-align:left" id="setupEmail" type="email" autocomplete="username" placeholder="admin@company.com" />'+
      '<label class="lg-lbl">كلمة المرور</label><input class="em-inp" style="padding:0 14px;direction:ltr;text-align:left" id="setupPassword" type="password" autocomplete="new-password" placeholder="••••••••" />'+
      '<div class="lg-err" id="lerr2"></div><div class="lg-hint">تظهر هذه الشاشة فقط عندما لا يوجد أي مستخدم إداري في قاعدة البيانات.</div>'+
      '<button class="lg-go" id="authGo" onclick="doFirstSetup()">إنشاء المدير</button></div>';
  }
  // The login markup calls this from an inline click handler.
  window.buildSetupUI=buildSetupUI;
  buildDD=function(){};
  pickUser=function(){};
  backToStep1=function(){};
  pbIn=function(){};
  pbKey=function(){};

  var VIEW_KEY='taqyeem_assessment_view';
  function saveView(view){try{sessionStorage.setItem(VIEW_KEY,JSON.stringify(view));}catch(e){}}
  function loadView(){try{return JSON.parse(sessionStorage.getItem(VIEW_KEY)||'{}')||{};}catch(e){return {};}}

  function showSystems(){
    pg('pgSystems','column');
    var b=$('systemEvalBtn');
    if(b&&!b.dataset.bound){b.dataset.bound='1';b.onclick=function(){hide('pgSystems');if(role('super_admin')){saveView({screen:'dashboard',serviceTab:'users'});initDash();openServices('users');}else{saveView({screen:'month'});showMonthPicker();}};}
    var f=$('systemFormsBtn');
    if(f&&!f.dataset.bound){f.dataset.bound='1';f.onclick=function(){location.href='/forms';};}
    var d=$('systemDesignBtn');
    if(d){d.style.display=can('design_templates.view')?'':'none';if(!d.dataset.bound){d.dataset.bound='1';d.onclick=function(){location.href='/design-templates';};}}
  }
  doLogin=async function(){
    if(A.loginBusy)return;
    var email=q($('lgEmail')&&$('lgEmail').value).trim().toLowerCase();
    var password=q($('lgPassword')&&$('lgPassword').value);
    var err=$('lerr2'),btn=$('authGo');
    if(!email||email.indexOf('@')<1){err.textContent='أدخل بريدًا إلكترونيًا صحيحًا';err.classList.add('show');return;}
    if(password.length<8){err.textContent='كلمة المرور يجب ألا تقل عن 8 أحرف';err.classList.add('show');return;}
    A.loginBusy=true;busy(btn,true,'جارٍ الدخول...');
    try{
      await api('/api/app/auth/login',{method:'POST',body:{email:email,password:password}});
      await loadBootstrap();
      err.classList.remove('show');hide('pgLogin');showSystems();
    }catch(e){err.textContent=humanError(e.message);err.classList.add('show');}
    finally{A.loginBusy=false;busy(btn,false);}
  };

  async function restoreSession(){
    try{var params=new URLSearchParams(location.search),resetToken=params.get('reset_token');if(resetToken){buildResetFormUI(resetToken);pg('pgLogin');document.body.classList.remove('auth-pending');return;}var st=await api('/api/app/auth/status');A.setupRequired=!!st.setup_required;if(A.setupRequired||params.get('setup')==='1'){buildSetupUI();pg('pgLogin');document.body.classList.remove('auth-pending');return;}var meErr=null;for(var attempt=0;attempt<8;attempt++){try{await api('/api/app/auth/me?ts='+Date.now());meErr=null;break;}catch(e){meErr=e;await new Promise(function(r){setTimeout(r,500+attempt*500);});}}if(meErr){try{var authSession=await api('/api/auth/session?ts='+Date.now());if(!authSession||!authSession.user)throw meErr;}catch(_e){throw meErr;}}await loadBootstrap();hide('pgLogin');var view=loadView();var cycles=A.data&&A.data.cycles||[];var preferred=cycles.find(function(c){return String(c.id)===String(cyclePref());})||latestCycle();if(view.screen==='month'){showMonthPicker();}else if(preferred){A.cycle=preferred;await loadCycleData();initDash(true);if(view.serviceTab)setTimeout(function(){openServices(view.serviceTab);},250);}else{initDash(true);}document.body.classList.remove('auth-pending');}
    catch(e){if(A.setupRequired)buildSetupUI();else buildLoginUI();pg('pgLogin');document.body.classList.remove('auth-pending');setTimeout(function(){var x=$('lgEmail');if(x)x.focus();},60);}
  }

  doLogout=async function(){
    if(!confirm('هل تريد تسجيل الخروج؟'))return;
    try{await api('/api/app/auth/logout',{method:'POST'});}catch(e){}
    A.data=null;A.permissions=[];A.roles=[];A.cycle=null;A.cycleData=null;A.criteriaCache={};A.evaluationIds={};A.evaluationStatus={};
    cu=null;evals={};allE=[];vis=[];CT={};CC={};CS={};
    hide('pgDash');hide('pgMonth');buildLoginUI();pg('pgLogin');
  };

  /* ---------- Bootstrap / month / cycle ---------- */
  async function loadBootstrap(cycleId){
    var j=await api('/api/app/bootstrap'+(cycleId?'?cycle_id='+encodeURIComponent(cycleId):''));
    A.data=j;A.permissions=j.permissions||[];A.roles=j.roles||[];
    cu={id:j.user.id,name:j.user.name||j.user.email,email:j.user.email,employee_id:j.user.employee_id};
    CT={};(j.employees||[]).forEach(function(e){var jt=e.job_titles&&e.job_titles.name?e.job_titles.name:'';CT[e.full_name]=jt;});
    return j;
  }
  async function selectCycle(cycle){
    if(!cycle||!cycle.id)return;
    A.cycle=cycle;saveCyclePref(cycle.id);
    var g=$('empGrid');if(g)g.innerHTML='<div class="d-empty">جارٍ تحميل بيانات الدورة...</div>';
    try{await loadCycleData();initDash(true);}catch(e){toast(humanError(e.message));renderGrid();}
  }
  function selectedMonth(){var m=ldMo();return m&&m.m&&m.y?{m:Number(m.m),y:Number(m.y)}:null;}
  function findCycle(m,y){return (A.data&&A.data.cycles||[]).find(function(c){return Number(c.month)===Number(m)&&Number(c.year)===Number(y);})||null;}
  function pad2(n){return String(n).padStart(2,'0');}
  function monthDates(m,y){var first=y+'-'+pad2(m)+'-01';var last=new Date(Number(y),Number(m),0).getDate();return {starts_at:first,ends_at:y+'-'+pad2(m)+'-'+pad2(last)};}

  showMonthPicker=function(){
    pg('pgMonth');$('mpGreet').textContent='مرحباً، '+(cu?cu.name:'');
    var yr=$('mpYear');yr.innerHTML='';
    var years={},cy=new Date().getFullYear();years[cy-1]=1;years[cy]=1;years[cy+1]=1;
    (A.data&&A.data.cycles||[]).forEach(function(c){years[c.year]=1;});
    Object.keys(years).map(Number).sort().forEach(function(y){var o=document.createElement('option');o.value=y;o.textContent=y;if(y===cy)o.selected=true;yr.appendChild(o);});
    var saved=ldMo();_mpSel=saved?parseInt(saved.m):null;if(saved&&saved.y&&years[saved.y])yr.value=saved.y;
    buildMpGrid();
  };
  buildMpGrid=function(){
    var g=$('mpGrid');g.innerHTML='';var y=Number($('mpYear').value);
    MONTHS.forEach(function(n,i){var m=i+1,exists=findCycle(m,y);var b=document.createElement('button');b.className='mp-m'+(_mpSel===m?' sel':'');b.textContent=n;b.title=exists?('حالة الدورة: '+exists.status):(can('evaluations.create')?'سيتم إنشاء دورة مسودة عند الاختيار':'لا توجد دورة لهذا الشهر');if(!exists&&!can('evaluations.create')){b.style.opacity='.45';}b.onclick=function(){if(!exists&&!can('evaluations.create')){toast('لا توجد دورة تقييم لهذا الشهر');return;}_mpSel=m;buildMpGrid();updMpBtn();};g.appendChild(b);});updMpBtn();
  };
  updMpBtn=function(){var b=$('mpGo');b.disabled=!_mpSel;b.textContent=_mpSel?'ابدأ التقييم · '+MONTHS[_mpSel-1]+' '+$('mpYear').value:'اختر الشهر';};
  mpConfirm=async function(){
    if(!_mpSel)return;var y=Number($('mpYear').value);var cycle=findCycle(_mpSel,y),btn=$('mpGo');busy(btn,true,'جارٍ التحميل...');
    try{
      if(!cycle){
        if(!can('evaluations.create'))throw new Error('cycle_not_found');
        var d=monthDates(_mpSel,y);var c=await api('/api/app/cycles',{method:'POST',body:{name:'تقييم '+MONTHS[_mpSel-1]+' '+y,month:_mpSel,year:y,starts_at:d.starts_at,ends_at:d.ends_at}});cycle=c.cycle;A.data.cycles.unshift(cycle);toast('تم إنشاء دورة التقييم كمسودة');
      }
      A.cycle=cycle;svMo({m:String(_mpSel),y:String(y)});saveView({screen:'dashboard'});await loadCycleData();hide('pgMonth');initDash();
    }catch(e){toast(humanError(e.message));}
    finally{busy(btn,false);}
  };

  async function loadCycleData(){
    if(!currentCycleId())return;
    var cid=currentCycleId();
    var jobs=[];
    if(can('evaluations.view'))jobs.push(api('/api/app/exclusions?cycle_id='+encodeURIComponent(cid)).catch(function(){return {exclusions:[]};}));else jobs.push(Promise.resolve({exclusions:[]}));
    if(can('attendance.view'))jobs.push(api('/api/app/attendance?cycle_id='+encodeURIComponent(cid)).catch(function(){return {attendance:[],entries:[]};}));else jobs.push(Promise.resolve({attendance:[],entries:[]}));
    var base=await loadBootstrap(cid);var res=await Promise.all(jobs);A.data=base;A.permissions=A.data.permissions||[];A.roles=A.data.roles||[];A.cycle=(A.data.cycles||[]).find(function(x){return String(x.id)===String(cid)})||A.cycle;
    A.cycleData={exclusions:res[0].exclusions||[],attendance:res[1].attendance||[],attendanceEntries:res[1].entries||[]};
    hydrateState();
  }

  function hydrateState(){
    var d=A.data||{};allE=(d.employees||[]).filter(function(e){return ['terminated','resigned'].indexOf(e.status)<0;}).map(function(e){return {id:String(e.id),name:e.full_name,job:(e.job_titles&&e.job_titles.name)||'',job_title_id:e.job_title_id,manager_id:e.manager_id,branch_id:e.branch_id,department_id:e.department_id,section_id:e.section_id,status:e.status};});
    CT={};allE.forEach(function(e){CT[e.name]=e.job||'';});vis=allE.slice();evals={};CS={};A.evaluationIds={};A.evaluationStatus={};
    (d.evaluations||[]).filter(function(x){return String(x.cycle_id)===String(currentCycleId());}).forEach(function(x){evals[x.employee_id]=evals[x.employee_id]||{};if(x.final_score!=null)evals[x.employee_id]._score=Number(x.final_score);evals[x.employee_id].notes=x.notes||'';A.evaluationIds[x.employee_id]=x.id;A.evaluationStatus[x.employee_id]=x.status;});
    (d.targets||[]).filter(function(x){return String(x.cycle_id)===String(currentCycleId());}).forEach(function(x){evals[x.employee_id]=Object.assign(evals[x.employee_id]||{},{tgt:Number(x.target_amount),got:Number(x.achieved_amount),why:x.last_edit_reason||'',edited:!!x.last_edit_reason,tDoneAt:x.updated_at||''});});
    var pens={};(d.penalties||[]).forEach(function(p){pens[p.id]=p.code;});
    (A.cycleData&&A.cycleData.attendance||[]).forEach(function(a){var st={};(A.cycleData.attendanceEntries||[]).filter(function(e){return e.attendance_evaluation_id===a.id;}).forEach(function(e){var code=pens[e.penalty_type_id];if(code)st[code]=Number(e.occurrences||0);});evals[a.employee_id]=Object.assign(evals[a.employee_id]||{},{att:st,notes:a.notes||'',doneAt:a.updated_at||'',_attendanceScore:Number(a.final_score)});});
    (A.cycleData&&A.cycleData.exclusions||[]).forEach(function(x){var e=empById(x.employee_id);if(!e)return;CS[e.name]=x.exclusion_type==='leave'?'leave':'branch';});
    var mo=A.cycle?{m:Number(A.cycle.month),y:Number(A.cycle.year)}:selectedMonth();if(mo&&$('moChip')){$('moChip').textContent=MONTHS[mo.m-1]+' '+mo.y;$('moChip').style.display='inline-block';}
  }

  var _origCalcScore=calcScore;
  calcScore=function(ev,n){if(ev&&ev._score!=null)return Number(ev._score);return _origCalcScore(ev,n);};
  isBranchUser=function(){return role('branch_manager');};
  hasTarget=function(n){return !role('hr_admin')&&can('targets.manage')&&(isSeller(n)||isBranchMgr(n));};
  modeFor=function(){return role('hr_admin')&&can('attendance.manage')?'attend':'criteria';};

  initDash=function(fromCycleLoad){
    if(!A.data) return;
    if(!A.cycle){var cs=A.data.cycles||[],saved=cyclePref();A.cycle=cs.find(function(c){return String(c.id)===String(saved);})||latestCycle();if(A.cycle&&!fromCycleLoad){selectCycle(A.cycle);return;}}
    hydrateState();pg('pgDash','column');$('pgDash').style.minHeight='100vh';$('tbUser').textContent='المُقيِّم: '+cu.name;
    var dt=$('dTitle');if(dt)dt.textContent=role('super_admin')?'لوحة تحكم الإدارة':(role('hr_admin')&&can('attendance.manage')?'تقييم إدارة الموارد البشرية':'تقييم أداء الموظفين');
    renderCyclePicker();installToolbarButtons();renderGrid();dAlertShow();
  };

  /* ---------- Grid: same cards/styles, permission-aware ---------- */
  function cardButton(emp,md,done){var eid=idjs(emp.id);if(md==='attend'&&!done)return '<div class="ec-two"><button class="ec-btn" onclick="startEval('+eid+','+idjs('attend')+')">تقييم</button><button class="ec-btn full" onclick="fullMark('+eid+')" title="درجة كاملة 100">100</button></div>';return '<button class="ec-btn'+(done?' ghost':'')+'" onclick="startEval('+eid+','+idjs(md)+')">'+(done?'عرض / إعادة التقييم':'بدء التقييم')+'</button>';}
  empCard=function(emp,md){
    var st=stOf(emp.name),off=!!st;md=md||modeFor(emp.name);var ev=evals[emp.id]||{};var val=null,tone='none',badge='—',unit='',sub='',extra='';
    if(!off){if(md==='target'){val=targetPct(ev);tone=pctTone(val);if(val!==null){badge=val;unit='%';sub=val>=100?'حقّق الهدف':'دون الهدف';if(ev.got!=null&&ev.tgt!=null)extra=(ev.got-ev.tgt>=0?'+':'')+fmtNum(ev.got-ev.tgt)+' ريال';}}else if(md==='attend'){val=ev._attendanceScore!=null?Number(ev._attendanceScore):attendScore(ev);tone=attTone(val);if(val!==null){badge=val;sub=attLabel(val);}}else{val=calcScore(ev,emp.name);tone=scoreTone(val);if(val!==null){badge=val;sub=scoreLabel(val);}}}
    var done=val!==null,fill=done?(md==='target'?Math.min(100,val):(md==='attend'?val:(val-1)/4*100)):0,over=(md==='target'&&done&&val>100)?Math.min(100,val-100):0;var esn=h(emp.name).replace(/'/g,"\\'");var c=document.createElement('div');c.className='emp-card'+(done?' t-'+tone:'')+(off?' emp-off':'');
    var flags=can('evaluations.edit')?'<div class="ec-flags"><button class="ec-flag'+(st==='leave'?' on':'')+'" onclick="setSt(\''+esn+'\',\'leave\')" title="الموظف في إجازة"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>إجازة</span></button><button class="ec-flag'+(st==='branch'?' on':'')+'" onclick="setSt(\''+esn+'\',\'branch\')"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M4 21v-2a4 4 0 0 1 3-3.87"/><circle cx="12" cy="7" r="4"/></svg><span>'+flagShort()+'</span></button></div>':'';
    c.innerHTML='<div class="ec-top">'+flags+'<div class="ec-badge'+(done?'':' pend')+(md==='target'&&done?' sm':'')+'">'+badge+(unit?'<i>'+unit+'</i>':'')+'</div></div><div class="ec-name">'+h(emp.name)+'</div><div class="ec-title">'+(h(emp.job)||'&nbsp;')+'</div><div class="ec-row"><span class="ec-status'+(off?' off':(done?'':' pend'))+'">'+(off?(st==='leave'?'في إجازة':flagTitle()):(done?sub:'بانتظار التقييم'))+'</span>'+(extra?'<span class="ec-diff">'+h(extra)+'</span>':'')+'</div><div class="ec-bar"><i style="width:'+fill.toFixed(0)+'%"></i>'+(over?'<u style="width:'+over.toFixed(0)+'%"></u>':'')+'</div>'+(off?'<button class="ec-btn ghost" onclick="setSt(\''+esn+'\',\''+st+'\')">إلغاء الاستبعاد</button>':cardButton(emp,md,done));return c;
  };

  renderGrid=function(){
    var g=$('empGrid');if(!g)return;g.innerHTML='';var base=vis.slice();var hr=role('hr_admin')&&can('attendance.manage');var tgt=!hr?base.filter(function(e){return hasTarget(e.name);}):[];var split=tgt.length>0;g.className='emp-grid'+(split?' has-sec':'');
    function addBtn(){if(!can('employees.create')&&!can('employees.update'))return null;var a=document.createElement('button');a.className='emp-add-card';a.type='button';a.onclick=function(){openServices('employees');};a.innerHTML='<span class="eac-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span><span class="eac-t">إدارة الموظفين</span>';return a;}
    if(!base.length)g.innerHTML='<div class="d-empty">لا توجد نتائج مطابقة</div>';
    if(hr){base.forEach(function(e){g.appendChild(empCard(e,'attend'));});var ab=addBtn();if(ab)g.appendChild(ab);updateStats();return;}
    if(split){g.appendChild(secHead('تقييم الأداء',base.length,'sh-perf'));var w1=document.createElement('div');w1.className='sec-grid';base.forEach(function(e){w1.appendChild(empCard(e,'criteria'));});var a1=addBtn();if(a1)w1.appendChild(a1);g.appendChild(w1);g.appendChild(secHead('تقييم الهدف البيعي',tgt.length,'sh-tgt'));var w2=document.createElement('div');w2.className='sec-grid';tgt.forEach(function(e){w2.appendChild(empCard(e,'target'));});g.appendChild(w2);updateStats();return;}
    base.forEach(function(e){g.appendChild(empCard(e,'criteria'));});var a=addBtn();if(a)g.appendChild(a);updateStats();
  };

  applyF=function(){var qv=$('srch').value.trim().toLowerCase();vis=allE.filter(function(e){return !qv||e.name.toLowerCase().indexOf(qv)>=0||String(e.job||'').toLowerCase().indexOf(qv)>=0;});renderGrid();};

  setSt=async function(n,v){
    if(!can('evaluations.edit')){toast('ليست لديك صلاحية الاستبعاد');return;}var e=allE.find(function(x){return x.name===n;});if(!e||!currentCycleId())return;var removing=stOf(n)===v;
    try{if(removing){await api('/api/app/exclusions?cycle_id='+encodeURIComponent(currentCycleId())+'&employee_id='+encodeURIComponent(e.id),{method:'DELETE'});delete CS[n];}else{var type=v==='leave'?'leave':(isBranchUser()?'other_branch':'other_manager');await api('/api/app/exclusions',{method:'POST',body:{cycle_id:currentCycleId(),employee_id:e.id,type:type,reason:v==='leave'?'إجازة':'تابع لجهة إدارية أخرى'}});CS[n]=v;}renderGrid();}
    catch(err){toast(humanError(err.message));}
  };

  resetAllEvals=function(){toast('الحذف الجماعي للتقييمات معطّل لحماية السجل. استخدم إعادة فتح التقييم من قسم المراجعة.');};

  /* ---------- Evaluations ---------- */
  var _criteriaMeta={};
  async function loadCriteria(emp){
    var j=await api('/api/app/criteria?employee_id='+encodeURIComponent(emp.id));var list=(j.items||[]).map(function(x){return {key:String(x.id),text:x.name,hint:x.description||'',comment_required:!!x.comment_required,mandatory:!!x.mandatory,max_score:Number(x.max_score||5)};});A.criteriaCache[emp.id]={template:j.template,items:list};CC[emp.name]=list;return list;
  }
  startEval=async function(id,md){
    var emp=empById(id);if(!emp)return;_eId=String(id);_eMode=md||modeFor(emp.name);var ev=evals[_eId]||{};$('evalEmpName').textContent=emp.name;document.querySelector('#pgEval .eval-sub').textContent=_eMode==='target'?'تقييم الهدف البيعي':(_eMode==='attend'?'تقييم إدارة الموارد البشرية':(jobOf(emp.name)||'تقييم الأداء الوظيفي'));
    if(!currentCycleId()){toast('اختر دورة تقييم أولاً');return;}
    if(_eMode==='target'){if(!can('targets.manage')){toast('ليست لديك صلاحية إدارة الأهداف');return;}_tg={tgt:ev.tgt!=null?ev.tgt:Number(setting('sales_target_default',100000)||100000),got:ev.got!=null?ev.got:null,edited:!!ev.edited,why:ev.why||'',unlock:false};_eNotes=ev.tnotes||'';hide('pgDash');pg('pgEval','column');renderTarget();renderEvalNav();return;}
    if(_eMode==='attend'){if(!can('attendance.manage')){toast('ليست لديك صلاحية تقييم الحضور');return;}_at={};for(var k in DEDUCT)_at[k]=(ev.att&&ev.att[k])||0;_eNotes=ev.notes||'';hide('pgDash');pg('pgEval','column');renderAttend();renderEvalNav();return;}
    if(!can('evaluations.edit')){toast('ليست لديك صلاحية تعديل التقييم');return;}
    try{
      var crit=await loadCriteria(emp);if(!crit.length)throw new Error('لا توجد معايير مرتبطة بهذا الموظف');
      var asg=await api('/api/app/evaluations?employee_id='+encodeURIComponent(emp.id)+'&cycle_id='+encodeURIComponent(currentCycleId()));if(!(asg.assignments||[]).length)throw new Error('ASSIGNMENT_NOT_FOUND');
      var ej=await api('/api/app/evaluations',{method:'POST',body:{action:'ensure',employee_id:emp.id,cycle_id:currentCycleId()}});var eid=ej.evaluation_id;A.evaluationIds[emp.id]=eid;
      var det=await api('/api/app/evaluations?evaluation_id='+encodeURIComponent(eid));var status=det.evaluation&&det.evaluation.status||'draft';A.evaluationStatus[emp.id]=status;
      if(status!=='draft'){
        if(can('evaluations.reopen')){var why=prompt('تم إرسال هذا التقييم. اكتب سبب إعادة فتحه للتعديل:');if(why===null)return;if(String(why).trim().length<3){toast('يجب كتابة سبب واضح');return;}await api('/api/app/evaluations',{method:'POST',body:{action:'draft',evaluation_id:eid,reason:String(why).trim()}});status='draft';A.evaluationStatus[emp.id]='draft';}
        else{toast('تم إرسال التقييم ولا يمكن تعديله إلا بعد إعادة فتحه من المسؤول');return;}
      }
      _eCrit=crit;_eAns={};(det.answers||[]).forEach(function(a){_eAns[String(a.criterion_id)]=Number(a.score);});_eNotes=(det.evaluation&&det.evaluation.notes)||'';var firstMissing=crit.findIndex(function(c){return _eAns[String(c.key)]==null;});_eStep=firstMissing>=0?firstMissing:crit.length;hide('pgDash');pg('pgEval','column');renderEvalStep();
    }catch(e){toast(humanError(e.message));}
  };

  var _autosaveNotesTimer=null;
  window.taqAutosaveAnswer=async function(criterionId,score){
    var emp=empById(_eId),eid=emp&&A.evaluationIds[emp.id];if(!eid||_eMode!=='criteria')return;
    try{var r=await api('/api/app/evaluations',{method:'POST',body:{action:'autosave',evaluation_id:eid,answer:{criterion_id:String(criterionId),score:Number(score),comment:''}}});if(emp&&r.score!=null){evals[emp.id]=Object.assign(evals[emp.id]||{},{_score:Number(r.score)});}}catch(e){toast('تعذر الحفظ التلقائي: '+humanError(e.message));}
  };
  window.taqAutosaveNotes=function(notes){
    clearTimeout(_autosaveNotesTimer);_autosaveNotesTimer=setTimeout(async function(){var emp=empById(_eId),eid=emp&&A.evaluationIds[emp.id];if(!eid||_eMode!=='criteria')return;try{await api('/api/app/evaluations',{method:'POST',body:{action:'autosave',evaluation_id:eid,notes:String(notes||'')}});}catch(e){toast('تعذر حفظ الملاحظات تلقائياً');}},500);
  };

  finishEval=async function(){
    var emp=empById(_eId);if(!emp)return;var nav=$('evalNav'),saveBtn=nav&&nav.querySelector('.eval-next');busy(saveBtn,true,'جارٍ الحفظ...');
    try{
      if(_eMode==='target'){
        if(_tg.got==null||!_tg.tgt)throw new Error('أدخل الهدف والمبلغ المحقق');
        await api('/api/app/targets',{method:'POST',body:{cycle_id:currentCycleId(),employee_id:emp.id,target:Number(_tg.tgt),achieved:Number(_tg.got),reason:_tg.edited?(_tg.why||'تعديل الهدف'):undefined}});
        evals[emp.id]=Object.assign(evals[emp.id]||{},{tgt:Number(_tg.tgt),got:Number(_tg.got),edited:!!_tg.edited,why:_tg.why||'',tnotes:_eNotes,tDoneAt:nowDT().date+' — '+nowDT().time});
      }else if(_eMode==='attend'){
        var byCode={};(A.data.penalties||[]).forEach(function(p){byCode[p.code]=p;});var entries=[];var score=100;for(var k in DEDUCT){var occ=parseInt(_at[k])||0;score-=occ*DEDUCT[k];if(byCode[k])entries.push({penalty_type_id:byCode[k].id,occurrences:occ});}
        await api('/api/app/attendance',{method:'POST',body:{cycle_id:currentCycleId(),employee_id:emp.id,notes:_eNotes||'',entries:entries}});
        var att={};for(var kk in DEDUCT)att[kk]=parseInt(_at[kk])||0;evals[emp.id]=Object.assign(evals[emp.id]||{},{att:att,notes:_eNotes,_attendanceScore:Math.max(0,score),doneAt:nowDT().date+' — '+nowDT().time});
      }else{
        var eid=A.evaluationIds[emp.id];if(!eid)throw new Error('evaluation_not_found');var answers=_eCrit.map(function(c){return {criterion_id:c.key,score:Number(_eAns[c.key]),comment:''};});if(answers.some(function(a){return !a.score;}))throw new Error('evaluation_incomplete');
        var saved=await api('/api/app/evaluations',{method:'POST',body:{action:'save',evaluation_id:eid,notes:_eNotes||'',answers:answers}});evals[emp.id]=Object.assign(evals[emp.id]||{},{answers:Object.assign({},_eAns),notes:_eNotes,_score:saved.score!=null?Number(saved.score):null,doneAt:nowDT().date+' — '+nowDT().time});
        if(can('evaluations.submit')){await api('/api/app/evaluations',{method:'POST',body:{action:'submitted',evaluation_id:eid}});A.evaluationStatus[emp.id]='submitted';}
      }
      hide('pgEval');pg('pgDash','column');$('pgDash').style.minHeight='100vh';renderGrid();toast('تم حفظ تقييم '+emp.name);
    }catch(e){toast(humanError(e.message));}
    finally{busy(saveBtn,false);}
  };

  fullMark=async function(id){var e=empById(id);if(!e||!can('attendance.manage'))return;try{var entries=(A.data.penalties||[]).map(function(p){return {penalty_type_id:p.id,occurrences:0};});await api('/api/app/attendance',{method:'POST',body:{cycle_id:currentCycleId(),employee_id:e.id,notes:'',entries:entries}});evals[e.id]=Object.assign(evals[e.id]||{},{att:{fp:0,late:0,early:0,ord:0},notes:'',_attendanceScore:100});renderGrid();toast('تم منح '+e.name+' الدرجة الكاملة');}catch(err){toast(humanError(err.message));}};

  /* ---------- Employee modal backed by real employees ---------- */
  function syncEdited(){allE=_ed.map(function(e){return {id:String(e.id),name:e.name,job:e.job||'',job_title_id:e.job_title_id||null,manager_id:e.manager_id||null,branch_id:e.branch_id||null,department_id:e.department_id||null,section_id:e.section_id||null,status:e.status||'active'};});CT={};allE.forEach(function(e){CT[e.name]=e.job;});var s=$('srch')?$('srch').value.trim().toLowerCase():'';vis=allE.filter(function(e){return !s||e.name.toLowerCase().indexOf(s)>=0||e.job.toLowerCase().indexOf(s)>=0;});renderGrid();}
  _commit=function(){syncEdited();};
  openEmpMo=function(){
    _ed=allE.map(function(e){return Object.assign({},e);});var dl=$('jobList');if(dl)dl.innerHTML=(A.data.job_titles||[]).map(function(t){return '<option value="'+h(t.name)+'"></option>';}).join('');_eRender();$('empMo').classList.add('show');var add=$('empAddI'),job=$('empAddJ');if(add)add.value='';if(job)job.value='';var addWrap=document.querySelector('#empMo .em-add');if(addWrap)addWrap.style.display=can('employees.create')?'flex':'none';
  };
  var _origERender=_eRender;
  _eRender=function(){_origERender();if(can('forms.view'))document.querySelectorAll('#empTb .em-row').forEach(function(rowEl,i){var actions=rowEl.querySelector('.em-acts');if(actions&&!actions.querySelector('.employee-documents-btn'))actions.insertAdjacentHTML('afterbegin','<button class="em-ic employee-documents-btn" onclick="openEmployeeDocuments('+i+')" title="النماذج والمستندات"><svg viewBox="0 0 24 24"><path d="M4 3h12l4 4v14H4z"/><path d="M16 3v5h5"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg></button>');});if(!can('employees.update'))document.querySelectorAll('#empMo .em-ic[id^="neb_"],#empMo .em-ic.ok').forEach(function(x){x.style.display='none';});if(!can('criteria.manage'))document.querySelectorAll('#empMo .em-acts .em-ic:not(.employee-documents-btn):nth-child(4)').forEach(function(x){x.style.display='none';});if(!can('employees.delete'))document.querySelectorAll('#empMo .em-ic.del').forEach(function(x){x.style.display='none';});};
  function ensureEmployeeDocumentsModal(){if($('employeeDocumentsMo'))return;var wrap=document.createElement('div');wrap.innerHTML='<div id="employeeDocumentsMo" class="em-ov" onclick="if(event.target===this)closeEmployeeDocuments()"><div class="em-box" style="max-width:760px"><div class="em-head"><div><div class="em-title" id="employeeDocumentsTitle">النماذج والمستندات</div><div class="em-sub">المستندات المرتبطة بسجل الموظف المركزي</div></div><button class="em-x" onclick="closeEmployeeDocuments()"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div id="employeeDocumentsBody" class="em-list"><div class="em-empty">جارٍ التحميل...</div></div><div class="em-foot"><span class="em-auto">البيانات من Neon وبحسب صلاحياتك</span><a class="em-save" style="flex:0 0 auto;padding:0 22px;text-decoration:none" href="/forms">فتح نظام النماذج</a></div></div></div>';document.body.appendChild(wrap.firstChild);}
  window.closeEmployeeDocuments=function(){var modal=$('employeeDocumentsMo');if(modal)modal.classList.remove('show');};
  window.openEmployeeDocuments=async function(i){var employee=_ed[i];if(!employee)return;ensureEmployeeDocumentsModal();$('employeeDocumentsTitle').textContent='النماذج والمستندات · '+employee.name;$('employeeDocumentsBody').innerHTML='<div class="em-empty">جارٍ التحميل...</div>';$('employeeDocumentsMo').classList.add('show');try{var result=await api('/api/app/employees/'+encodeURIComponent(employee.id)+'/forms');var statusNames={draft:'مسودة',submitted:'مرسل',pending_approval:'قيد الموافقة',approved:'معتمد',rejected:'مرفوض',returned_for_edit:'معاد للتعديل',cancelled:'ملغى',issued:'صادر',archived:'مؤرشف'},html='';function section(title,count){return '<div class="sec-head"><span class="sh-t">'+h(title)+'</span><span class="sh-n">'+count+'</span></div>';}var assets=result.assets||[];if(assets.length){html+=section('العهد',assets.length);html+=assets.map(function(x){return row(x.asset_name,(x.status==='returned'?'مُعادة':'على الموظف')+' · الكمية '+x.quantity+' · المستند '+x.document_number,'');}).join('');}var violations=result.violations||[];if(violations.length){html+=section('المخالفات الجزائية',violations.length);html+=violations.map(function(x){return row(x.violation_type||'مخالفة',(x.violation_date||'بدون تاريخ')+' · '+(x.penalty||'بدون جزاء')+' · المستند '+x.document_number,'');}).join('');}var advances=result.advances||[];if(advances.length){html+=section('السلف',advances.length);html+=advances.map(function(x){return row(x.request_type||'سلفة',(x.amount==null?'—':Number(x.amount).toLocaleString('en-US')+' ريال')+' · '+(x.request_date||'بدون تاريخ')+' · المستند '+x.document_number,'');}).join('');}var reports=result.monthly_reports||[];if(reports.length){html+=section('التقارير الشهرية',reports.length);html+=reports.map(function(x){return row('تقرير شهري',(x.period_from||'—')+' إلى '+(x.period_to||'—')+' · المستند '+x.document_number,'');}).join('');}var documents=result.documents||[];if(documents.length){html+=section('جميع المستندات',documents.length);html+=documents.map(function(document){var payload=document.payload||{};var title=payload.formName||document.form_type||'نموذج إداري';var date=document.approved_at||document.submitted_at||document.updated_at||document.created_at;return row(title,'رقم '+(document.document_no||'—')+' · '+(statusNames[document.status]||document.status||'—')+' · '+new Date(date).toLocaleDateString('ar-SA'),'');}).join('');}$('employeeDocumentsBody').innerHTML=html||'<div class="em-empty">لا توجد نماذج أو مستندات مرتبطة بهذا الموظف</div>';}catch(error){$('employeeDocumentsBody').innerHTML='<div class="em-empty">'+h(humanError(error.message))+'</div>';}};
  eAdd=async function(){var inp=$('empAddI'),jb=$('empAddJ'),n=inp.value.trim(),j=jb?jb.value.trim():'';if(!n){toast('يُرجى إدخال اسم الموظف');return;}if(_ed.some(function(e){return e.name===n;})){toast('هذا الاسم موجود مسبقاً');return;}try{var r=await api('/api/app/employees',{method:'POST',body:{full_name:n,job_title_name:j||null}});_ed.push({id:r.employee.id,name:n,job:j,job_title_id:r.employee.job_title_id,status:'active'});syncEdited();_eRender();inp.value='';if(jb)jb.value='';toast('تمت إضافة: '+n);}catch(e){toast(humanError(e.message));}};
  eCommit=async function(i){var inp=$('ni_'+i),ji=$('nij_'+i),n=inp.value.trim(),j=ji?ji.value.trim():'';if(!n){toast('لا يمكن ترك الاسم فارغاً');return;}try{var r=await api('/api/app/employees',{method:'PATCH',body:{id:_ed[i].id,full_name:n,job_title_name:j||null}});_ed[i].name=n;_ed[i].job=j;_ed[i].job_title_id=r.employee.job_title_id;syncEdited();_eRender();toast('تم حفظ التعديل');}catch(e){toast(humanError(e.message));}};
  eDel=async function(i){if(!confirm('إنهاء/حذف «'+_ed[i].name+'» من القائمة النشطة؟'))return;try{await api('/api/app/employees?id='+encodeURIComponent(_ed[i].id),{method:'DELETE'});_ed.splice(i,1);syncEdited();_eRender();toast('تم إنهاء الموظف');}catch(e){toast(humanError(e.message));}};

  /* ---------- Criteria modal backed by templates ---------- */
  var _crEmployeeId=null,_crTemplate=null;
  crOpen=async function(i){var emp=_ed[i];if(!emp)return;_crName=emp.name;_crEmployeeId=emp.id;try{var j=await api('/api/app/criteria?employee_id='+encodeURIComponent(emp.id));_crTemplate=j.template||null;_crList=(j.items||[]).map(function(c){return {key:String(c.id),text:c.name,hint:c.description||'',weight:Number(c.weight||1),mandatory:!!c.mandatory,visible_to_employee:!!c.visible_to_employee,comment_required:!!c.comment_required};});$('crWho').textContent=emp.name;crSrcLbl();crRender();$('crMo').classList.add('show');}catch(e){toast(humanError(e.message));}};
  crSrcLbl=function(){var el=$('crSrc');if(!el)return;var label=_crTemplate?(_crTemplate.scope_type==='employee'?'معايير مخصّصة':(_crTemplate.scope_type==='job_title'?'المسمى الوظيفي':(_crTemplate.scope_type==='department'?'الإدارة':'معايير عامة'))):'لا يوجد قالب';el.innerHTML='<span class="cr-src '+(_crTemplate&&_crTemplate.scope_type==='employee'?'custom':'role')+'">'+h(label)+'</span>';};
  var _origCrRender=crRender;
  crRender=function(){_origCrRender();if(!can('criteria.manage')){document.querySelectorAll('#crMo textarea').forEach(function(x){x.readOnly=true;});document.querySelectorAll('#crMo .cr-del,.cr-addwrap,.em-cancel').forEach(function(x){x.style.display='none';});var save=document.querySelector('#crMo .em-save');if(save)save.textContent='إغلاق';}};
  crPersist=function(){return;};
  crClose=function(){$('crMo').classList.remove('show');};
  crDone=async function(){if(!can('criteria.manage')){crClose();return;}var clean=_crList.filter(function(c){return String(c.text||'').trim();});if(!clean.length){toast('يجب إدخال معيار واحد على الأقل');return;}try{var r=await api('/api/app/criteria',{method:'POST',body:{employee_id:_crEmployeeId,items:clean.map(function(c){return {name:String(c.text).trim(),description:String(c.hint||'').trim(),max_score:5,weight:Number(c.weight||1),mandatory:c.mandatory!==false,visible_to_employee:c.visible_to_employee!==false,comment_required:!!c.comment_required};})}});_crTemplate={id:r.template_id,scope_type:'employee',version:r.version};A.criteriaCache[_crEmployeeId]=null;crClose();toast('تم حفظ المعايير المخصّصة');}catch(e){toast(humanError(e.message));}};
  crReset=async function(){if(!can('criteria.manage'))return;if(!confirm('استعادة المعايير الافتراضية لـ «'+_crName+'»؟'))return;try{await api('/api/app/criteria',{method:'POST',body:{action:'reset',employee_id:_crEmployeeId}});A.criteriaCache[_crEmployeeId]=null;var j=await api('/api/app/criteria?employee_id='+encodeURIComponent(_crEmployeeId));_crTemplate=j.template||null;_crList=(j.items||[]).map(function(c){return {key:String(c.id),text:c.name,hint:c.description||''};});crSrcLbl();crRender();toast('تمت استعادة المعايير الافتراضية');}catch(e){toast(humanError(e.message));}};

  /* ---------- Services modal ---------- */
  function installToolbarButtons(){
    var bar=document.querySelector('#pgDash .d-bar');if(!bar)return;if(!$('svcBtn')){var b=document.createElement('button');b.id='svcBtn';b.className='btn btn-g';b.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.7a1.7 1.7 0 0 0-1.56-1.04H5v-3h.44A1.7 1.7 0 0 0 7 9.62a1.7 1.7 0 0 0-.34-1.88L6.6 7.68l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.4V4h3v.4a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04H21v3h-.04A1.7 1.7 0 0 0 19.4 15z"/></svg>الخدمات';b.onclick=function(){openServices();};bar.appendChild(b);}
    if(can('reports.export')){var old=bar.querySelector('button[onclick="exportExcel()"]');if(old){old.onclick=function(){serverExport();};old.setAttribute('onclick','serverExport()');}}
  }
  function ensureServiceModal(){if($('svcMo'))return;var wrap=document.createElement('div');wrap.innerHTML='<div id="svcMo" class="em-ov" onclick="if(event.target===this)closeServices()"><div class="em-box" style="max-width:900px;overflow:hidden"><div class="em-head"><div><div class="em-title">الخدمات والإدارة</div><div class="em-sub" id="svcSub">مرتبطة مباشرة بقاعدة بيانات Neon</div></div><button class="em-x" onclick="closeServices()"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div id="svcTabs" style="display:flex;gap:7px;flex-wrap:wrap;padding:0 26px 14px"></div><div id="svcBody" class="em-list" style="padding-bottom:18px"></div><div class="em-foot"><span class="em-auto" id="svcFoot">الصلاحيات مطبقة من قاعدة البيانات</span><button class="em-save" style="flex:0 0 auto;padding:0 30px" onclick="closeServices()">تم</button></div></div></div>';document.body.appendChild(wrap.firstChild);var body=$('svcBody');if(body){body.addEventListener('click',function(e){var t=e.target.closest('.role-perm-toggle');if(t){e.preventDefault();var id=t.getAttribute('data-role-id');if(id)window.toggleRolePerm(id);}});}}
  function tabs(){var t=[];if(can('evaluations.view'))t.push(['cycles','الدورات']);if(can('evaluations.review')||can('evaluations.approve')||can('evaluations.publish')||can('evaluations.reopen'))t.push(['review','المراجعة']);if(can('employees.view'))t.push(['employees','الموظفون']);if(can('users.view'))t.push(['users','المستخدمون']);if(can('branches.manage')||can('departments.manage')||can('job_titles.manage')||can('employees.update'))t.push(['org','الهيكل']);if(can('roles.manage'))t.push(['roles','الصلاحيات']);if(can('settings.manage'))t.push(['settings','الإعدادات']);if(can('reports.view'))t.push(['reports','التقارير']);if(can('audit_logs.view'))t.push(['audit','سجل العمليات']);t.push(['notifications','الإشعارات']);if(cu&&cu.employee_id)t.push(['portal','ملفي']);return t;}
  window.openServices=async function(tab){ensureServiceModal();$('svcMo').classList.add('show');var ts=tabs(),active=tab||ts[0][0];saveView({screen:'dashboard',serviceTab:active});$('svcTabs').innerHTML=ts.map(function(x){return '<button class="btn '+(x[0]===active?'':'btn-g')+'" style="'+(x[0]===active?'background:var(--blue);color:#fff':'')+'" onclick="svcTab(\''+x[0]+'\')">'+x[1]+'</button>';}).join('');await renderService(active);};
  window.closeServices=function(){$('svcMo').classList.remove('show');saveView({screen:'dashboard'});};
  window.svcTab=async function(tab){await openServices(tab);};
  async function loadAdmin(){if(!A.admin)A.admin=await api('/api/app/admin');return A.admin;}
  async function renderService(tab){var b=$('svcBody');b.innerHTML='<div class="em-empty">جارٍ التحميل...</div>';try{if(tab==='cycles')await svcCycles(b);else if(tab==='review')await svcReview(b);else if(tab==='employees')await svcEmployees(b);else if(tab==='users')await svcUsers(b);else if(tab==='org')await svcOrg(b);else if(tab==='roles')await svcRoles(b);else if(tab==='settings')await svcSettings(b);else if(tab==='reports')await svcReports(b);else if(tab==='audit')await svcAudit(b);else if(tab==='notifications')await svcNotifications(b);else if(tab==='portal')await svcPortal(b);}catch(e){b.innerHTML='<div class="em-empty">'+h(humanError(e.message))+'</div>';}}
  function row(title,sub,actions){return '<div class="em-row"><span class="em-av">'+AVIC+'</span><div class="em-txt"><div class="em-nm">'+h(title)+'</div><div class="em-jb">'+h(sub||'')+'</div></div><div class="em-acts">'+(actions||'')+'</div></div>';}
  function actionBtn(label,fn,kind){return '<button class="em-ic '+(kind||'')+'" style="width:auto;padding:0 10px" onclick="'+fn+'">'+h(label)+'</button>';}

  async function svcCycles(b){var j=await api('/api/app/cycles');A.data.cycles=j.cycles||[];var html='';if(can('evaluations.create'))html='<div class="em-add"><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px" id="cyName" placeholder="اسم الدورة" value="تقييم '+h(MONTHS[_mpSel-1]||'')+' '+h($('mpYear')&&$('mpYear').value||'')+'"></div><button class="em-addbtn" onclick="svcCreateCycle()">إنشاء دورة</button></div>';html+='<div>';(j.cycles||[]).forEach(function(c){var act='';if(can('evaluations.create')&&c.status==='draft')act=actionBtn('فتح','svcOpenCycle('+idjs(c.id)+')');html+=row(c.name,MONTHS[Number(c.month)-1]+' '+c.year+' · '+c.status,act);});html+='</div>';b.innerHTML=html||'<div class="em-empty">لا توجد دورات تقييم</div>';}
  window.svcCreateCycle=async function(){try{var m=_mpSel||new Date().getMonth()+1,y=Number($('mpYear')&&$('mpYear').value||new Date().getFullYear()),d=monthDates(m,y),name=q($('cyName')&&$('cyName').value).trim()||('تقييم '+MONTHS[m-1]+' '+y);await api('/api/app/cycles',{method:'POST',body:{name:name,month:m,year:y,starts_at:d.starts_at,ends_at:d.ends_at}});A.admin=null;await loadBootstrap();toast('تم إنشاء الدورة');await svcTab('cycles');}catch(e){toast(humanError(e.message));}};
  window.svcOpenCycle=async function(id){try{var r=await api('/api/app/cycles',{method:'POST',body:{action:'open',id:id}});await loadBootstrap();toast('تم فتح الدورة وإنشاء '+(r.assignments_created||0)+' تكليف تقييم');await svcTab('cycles');}catch(e){toast(humanError(e.message));}};

  async function svcReview(b){var j=await api('/api/app/evaluations?queue=review'+(currentCycleId()?'&cycle_id='+encodeURIComponent(currentCycleId()):''));A.reviewItems=j.evaluations||[];if(!A.reviewItems.length){b.innerHTML='<div class="em-empty">لا توجد تقييمات في مسار المراجعة</div>';return;}b.innerHTML=A.reviewItems.map(function(e){var nm=e.employees&&e.employees.full_name||'موظف',act='';if(e.status==='submitted'&&can('evaluations.review'))act+=actionBtn('مراجعة','svcTransition('+idjs(e.id)+',\'reviewed\')');if(['submitted','reviewed'].indexOf(e.status)>=0&&can('evaluations.approve'))act+=actionBtn('اعتماد','svcTransition('+idjs(e.id)+',\'approved\')');if(e.status==='approved'&&can('evaluations.publish'))act+=actionBtn('نشر','svcTransition('+idjs(e.id)+',\'published\')');if(e.status==='published'&&can('evaluations.approve'))act+=actionBtn('قفل','svcTransition('+idjs(e.id)+',\'locked\')');if(e.status!=='draft'&&can('evaluations.reopen'))act+=actionBtn('إعادة فتح','svcTransition('+idjs(e.id)+',\'draft\')');return row(nm,'الحالة: '+e.status+(e.final_score!=null?' · الدرجة '+e.final_score:''),act);}).join('');}
  window.svcTransition=async function(id,to){var reason=null;if(to==='draft'){reason=prompt('سبب إعادة فتح التقييم:');if(reason===null)return;if(String(reason).trim().length<3){toast('اكتب سبباً واضحاً');return;}}try{await api('/api/app/evaluations',{method:'POST',body:{action:to,evaluation_id:id,reason:reason}});toast('تم تحديث حالة التقييم');await svcTab('review');}catch(e){toast(humanError(e.message));}};

  async function svcEmployees(b){var admin=await loadAdmin(),j=await api('/api/app/employees?limit=300');var employees=(j.employees||[]).filter(function(e){return ['terminated','resigned'].indexOf(e.status)<0;});var titleById={};(admin.job_titles||[]).forEach(function(t){titleById[String(t.id)]=t.name;});var titleOpts='<option value="">بدون مسمى</option>'+(admin.job_titles||[]).map(function(t){return '<option value="'+h(t.id)+'">'+h(t.name)+'</option>';}).join('');var managerOpts='<option value="">بدون مدير مباشر</option>'+employees.map(function(e){return '<option value="'+h(e.id)+'">'+h(e.full_name)+'</option>';}).join('');var form='';if(can('employees.create'))form='<div class="em-add" style="align-items:flex-end"><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px" id="svcEmpName" placeholder="اسم الموظف"></div><div class="em-inp-wrap"><select class="em-inp" style="padding:0 14px" id="svcEmpTitle">'+titleOpts+'</select></div><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px;direction:ltr" id="svcEmpEmail" placeholder="البريد الإلكتروني"></div><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px;direction:ltr" id="svcEmpPhone" placeholder="الجوال"></div><div class="em-inp-wrap"><select class="em-inp" style="padding:0 14px" id="svcEmpManager">'+managerOpts+'</select></div><button class="em-addbtn" onclick="svcCreateEmployee()">إضافة موظف</button></div>';var search='<div class="em-add" style="align-items:center"><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px" id="svcEmpSearch" oninput="svcFilterEmployees()" placeholder="ابحث باسم الموظف أو المسمى أو البريد"></div></div>';var list=employees.map(function(e){var title=(e.job_titles&&e.job_titles.name)||titleById[String(e.job_title_id)]||'',sub=(title||'بدون مسمى')+(e.email?' · '+e.email:'')+(e.phone?' · '+e.phone:'')+' · '+(e.status||'active');var actions='';if(can('employees.update'))actions+=actionBtn('تعديل','svcEditEmployee('+idjs(e.id)+')');if(can('employees.delete'))actions+=actionBtn('تعطيل','svcDeleteEmployee('+idjs(e.id)+','+idjs(e.full_name)+')','del');return '<div class="em-row svc-employee-row" data-search="'+h((e.full_name+' '+title+' '+(e.email||'')).toLowerCase())+'"><span class="em-av">'+AVIC+'</span><div class="em-txt"><div class="em-nm">'+h(e.full_name)+'</div><div class="em-jb">'+h(sub)+'</div></div><div class="em-acts">'+actions+'</div></div>';}).join('');b.innerHTML=form+search+'<div class="sec-head"><span class="sh-t">الموظفون</span><span class="sh-n">'+employees.length+'</span></div>'+(list||'<div class="em-empty">لا توجد موظفين ضمن صلاحيتك</div>');}
  window.svcFilterEmployees=function(){var qv=q($('svcEmpSearch')&&$('svcEmpSearch').value).trim().toLowerCase();document.querySelectorAll('.svc-employee-row').forEach(function(r){r.style.display=!qv||String(r.getAttribute('data-search')||'').indexOf(qv)>=0?'flex':'none';});};
  window.svcCreateEmployee=async function(){try{var body={full_name:q($('svcEmpName').value).trim(),job_title_id:$('svcEmpTitle').value||null,email:q($('svcEmpEmail').value).trim()||null,phone:q($('svcEmpPhone').value).trim()||null,manager_id:$('svcEmpManager').value||null};await api('/api/app/employees',{method:'POST',body:body});await loadBootstrap(currentCycleId());await loadCycleData();toast('تمت إضافة الموظف');await svcTab('employees');}catch(e){toast(humanError(e.message));}};
  window.svcEditEmployee=async function(id){var e=serverEmployeeById(id)||allE.find(function(x){return String(x.id)===String(id);});if(!e)return;var name=prompt('اسم الموظف:',e.full_name||e.name||'');if(name===null)return;var title=prompt('المسمى الوظيفي:',(e.job_titles&&e.job_titles.name)||e.job||'');if(title===null)return;try{await api('/api/app/employees',{method:'PATCH',body:{id:id,full_name:String(name).trim(),job_title_name:String(title).trim()||null}});await loadBootstrap(currentCycleId());await loadCycleData();renderGrid();toast('تم تعديل الموظف');await svcTab('employees');}catch(err){toast(humanError(err.message));}};
  window.svcDeleteEmployee=async function(id,name){if(!confirm('تعطيل الموظف «'+name+'»؟'))return;try{await api('/api/app/employees?id='+encodeURIComponent(id),{method:'DELETE'});await loadBootstrap(currentCycleId());await loadCycleData();renderGrid();toast('تم تعطيل الموظف');await svcTab('employees');}catch(e){toast(humanError(e.message));}};

  async function svcUsers(b){var j=await api('/api/app/users');A.users=j;var admin=await loadAdmin();var roleOpts=(j.roles||[]).map(function(r){return '<option value="'+r.id+'" data-code="'+h(r.code)+'">'+h(r.name_ar)+'</option>';}).join(''),empOpts='<option value="">بدون ربط بموظف</option>'+allE.map(function(e){return '<option value="'+e.id+'">'+h(e.name)+'</option>';}).join('');var form='';if(can('users.create')&&can('roles.manage'))form='<div class="em-add" style="align-items:flex-end"><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px" id="uName" placeholder="الاسم"></div><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px;direction:ltr" id="uEmail" placeholder="email@company.com"></div><div class="em-inp-wrap"><input class="em-inp" style="padding:0 14px;direction:ltr" id="uPass" type="password" placeholder="كلمة المرور"></div><div class="em-inp-wrap"><select class="em-inp" style="padding:0 14px" id="uEmp">'+empOpts+'</select></div><div class="em-inp-wrap"><select class="em-inp" style="padding:0 14px" id="uRole" onchange="svcScopeChange()">'+roleOpts+'</select></div><div class="em-inp-wrap"><select class="em-inp" style="padding:0 14px" id="uScopeType" onchange="svcScopeChange()"><option value="organization">المنشأة كاملة</option><option value="branch">فرع محدد</option><option value="department">إدارة محددة</option><option value="assigned_employees">الموظفون المسندون فقط</option></select></div><div class="em-inp-wrap" id="uScopeIdWrap" style="display:none"><select class="em-inp" style="padding:0 14px" id="uScopeId"></select></div><button class="em-addbtn" onclick="svcCreateUser()">إضافة مستخدم</button></div>';var list=(j.users||[]).map(function(u){var act=can('users.update')?actionBtn(u.is_active?'تعطيل':'تفعيل','svcToggleUser('+idjs(u.id)+','+(!u.is_active)+')'):'';return row(u.full_name||u.email,(u.email||'')+(u.is_active?' · نشط':' · معطل'),act);}).join('');b.innerHTML=form+list+(list?'':'<div class="em-empty">لا توجد حسابات</div>');if(form)svcScopeChange();}
  window.svcScopeChange=function(){var a=A.admin||{},t=$('uScopeType');if(!t)return;var roleSel=$('uRole'),roleCode=roleSel&&roleSel.options[roleSel.selectedIndex]?roleSel.options[roleSel.selectedIndex].getAttribute('data-code'):'';if(['super_admin','hr_admin','auditor'].indexOf(roleCode)>=0)t.value='organization';else if(roleCode==='branch_manager'&&t.value==='organization')t.value='branch';else if(roleCode==='department_manager'&&t.value==='organization')t.value='department';else if(roleCode==='supervisor'&&t.value==='organization')t.value='assigned_employees';var wrap=$('uScopeIdWrap'),sel=$('uScopeId'),type=t.value;if(type==='branch'){wrap.style.display='';sel.innerHTML=(a.branches||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join('');}else if(type==='department'){wrap.style.display='';sel.innerHTML=(a.departments||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join('');}else{wrap.style.display='none';sel.innerHTML='';}};
  window.svcCreateUser=async function(){try{var st=$('uScopeType').value,sid=(st==='branch'||st==='department')?($('uScopeId').value||null):null;var body={full_name:q($('uName').value).trim(),email:q($('uEmail').value).trim(),password:q($('uPass').value),employee_id:$('uEmp').value||null,role_id:$('uRole').value,scope_type:st,scope_id:sid};await api('/api/app/users',{method:'POST',body:body});toast('تم إنشاء المستخدم');await svcTab('users');}catch(e){toast(humanError(e.message));}};
  window.svcToggleUser=async function(id,on){try{await api('/api/app/users',{method:'PATCH',body:{id:id,is_active:on}});toast(on?'تم تفعيل الحساب':'تم تعطيل الحساب');await svcTab('users');}catch(e){toast(humanError(e.message));}};

  async function svcOrg(b){var a=await loadAdmin();var html='';if(can('branches.manage'))html+='<div class="sec-head"><span class="sh-t">الفروع</span><span class="sh-n">'+(a.branches||[]).length+'</span></div><div class="em-add"><div class="em-inp-wrap"><input id="brName" class="em-inp" style="padding:0 14px" placeholder="اسم الفرع"></div><div class="em-inp-wrap"><input id="brCode" class="em-inp" style="padding:0 14px;direction:ltr" placeholder="CODE"></div><button class="em-addbtn" onclick="svcCreateBranch()">إضافة</button></div>'+(a.branches||[]).map(function(x){return row(x.name,x.code+(x.city?' · '+x.city:''),'');}).join('');if(can('departments.manage'))html+='<div class="sec-head"><span class="sh-t">الإدارات</span><span class="sh-n">'+(a.departments||[]).length+'</span></div><div class="em-add"><div class="em-inp-wrap"><input id="dpName" class="em-inp" style="padding:0 14px" placeholder="اسم الإدارة"></div><div class="em-inp-wrap"><input id="dpCode" class="em-inp" style="padding:0 14px;direction:ltr" placeholder="CODE"></div><div class="em-inp-wrap"><select id="dpBranch" class="em-inp" style="padding:0 14px"><option value="">بدون فرع</option>'+(a.branches||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join('')+'</select></div><button class="em-addbtn" onclick="svcCreateDept()">إضافة</button></div>'+(a.departments||[]).map(function(x){return row(x.name,x.code,'');}).join('');if(can('sections.manage'))html+='<div class="sec-head"><span class="sh-t">الأقسام</span><span class="sh-n">'+(a.sections||[]).length+'</span></div><div class="em-add"><div class="em-inp-wrap"><input id="scName" class="em-inp" style="padding:0 14px" placeholder="اسم القسم"></div><div class="em-inp-wrap"><input id="scCode" class="em-inp" style="padding:0 14px;direction:ltr" placeholder="CODE"></div><div class="em-inp-wrap"><select id="scDept" class="em-inp" style="padding:0 14px"><option value="">اختر الإدارة</option>'+(a.departments||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join('')+'</select></div><button class="em-addbtn" onclick="svcCreateSection()">إضافة</button></div>'+(a.sections||[]).map(function(x){var d=(a.departments||[]).find(function(v){return v.id===x.department_id;});return row(x.name,x.code+(d?' · '+d.name:''),'');}).join('');if(can('job_titles.manage'))html+='<div class="sec-head"><span class="sh-t">المسميات الوظيفية</span><span class="sh-n">'+(a.job_titles||[]).length+'</span></div><div class="em-add"><div class="em-inp-wrap"><input id="jtName" class="em-inp" style="padding:0 14px" placeholder="اسم المسمى"></div><div class="em-inp-wrap"><input id="jtCode" class="em-inp" style="padding:0 14px;direction:ltr" placeholder="CODE"></div><button class="em-addbtn" onclick="svcCreateTitle()">إضافة</button></div>'+(a.job_titles||[]).map(function(x){return row(x.name,x.code,'');}).join('');if(can('employees.update'))html+=assignmentForm(a);try{var fm=await api('/api/app/employees/'+encodeURIComponent(j.employee.id)+'/forms');(fm.documents||[]).forEach(function(d){html+=row('نموذج إداري · '+(d.form_type||''),'رقم '+(d.document_no||'')+' · '+(d.status||''),'');});}catch(_e){}b.innerHTML=html||'<div class="em-empty">لا توجد نتائج منشورة بعد</div>';}
  function assignmentForm(a){var empOpts='<option value="">اختر الموظف</option>'+allE.map(function(e){return '<option value="'+e.id+'">'+h(e.name)+'</option>';}).join(''),br='<option value="">بدون فرع</option>'+(a.branches||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join(''),dp='<option value="">بدون إدارة</option>'+(a.departments||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join(''),sc='<option value="">بدون قسم</option>'+(a.sections||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join(''),jt='<option value="">بدون مسمى</option>'+(a.job_titles||[]).map(function(x){return '<option value="'+x.id+'">'+h(x.name)+'</option>';}).join(''),mgr='<option value="">بدون مدير</option>'+allE.map(function(e){return '<option value="'+e.id+'">'+h(e.name)+'</option>';}).join(''),sup='<option value="">بدون مشرف</option>'+allE.map(function(e){return '<option value="'+e.id+'">'+h(e.name)+'</option>';}).join('');return '<div class="sec-head"><span class="sh-t">التبعية الوظيفية</span><span class="sh-n">نقل / إسناد</span></div><div class="em-add"><div class="em-inp-wrap"><select id="asEmp" class="em-inp" style="padding:0 14px">'+empOpts+'</select></div><div class="em-inp-wrap"><select id="asBranch" class="em-inp" style="padding:0 14px">'+br+'</select></div><div class="em-inp-wrap"><select id="asDept" class="em-inp" style="padding:0 14px">'+dp+'</select></div><div class="em-inp-wrap"><select id="asSection" class="em-inp" style="padding:0 14px">'+sc+'</select></div><div class="em-inp-wrap"><select id="asTitle" class="em-inp" style="padding:0 14px">'+jt+'</select></div><div class="em-inp-wrap"><select id="asManager" class="em-inp" style="padding:0 14px">'+mgr+'</select></div><div class="em-inp-wrap"><select id="asSupervisor" class="em-inp" style="padding:0 14px">'+sup+'</select></div><div class="em-inp-wrap"><input id="asReason" class="em-inp" style="padding:0 14px" placeholder="سبب التغيير"></div><button class="em-addbtn" onclick="svcAssignEmployee()">حفظ</button></div>';}
  window.svcCreateBranch=async function(){try{await api('/api/app/admin',{method:'POST',body:{action:'create_branch',name:q($('brName').value).trim(),code:q($('brCode').value).trim().toUpperCase()}});A.admin=null;toast('تمت إضافة الفرع');await svcTab('org');}catch(e){toast(humanError(e.message));}};
  window.svcCreateDept=async function(){try{await api('/api/app/admin',{method:'POST',body:{action:'create_department',name:q($('dpName').value).trim(),code:q($('dpCode').value).trim().toUpperCase(),branch_id:$('dpBranch').value||null}});A.admin=null;toast('تمت إضافة الإدارة');await svcTab('org');}catch(e){toast(humanError(e.message));}};
  window.svcCreateSection=async function(){try{if(!$('scDept').value)throw new Error('اختر الإدارة');await api('/api/app/admin',{method:'POST',body:{action:'create_section',name:q($('scName').value).trim(),code:q($('scCode').value).trim().toUpperCase(),department_id:$('scDept').value}});A.admin=null;toast('تمت إضافة القسم');await svcTab('org');}catch(e){toast(humanError(e.message));}};
  window.svcCreateTitle=async function(){try{await api('/api/app/admin',{method:'POST',body:{action:'create_job_title',name:q($('jtName').value).trim(),code:q($('jtCode').value).trim().toUpperCase()}});A.admin=null;await loadBootstrap();toast('تمت إضافة المسمى');await svcTab('org');}catch(e){toast(humanError(e.message));}};
  window.svcAssignEmployee=async function(){try{if(!$('asEmp').value)throw new Error('اختر الموظف');await api('/api/app/employees',{method:'PATCH',body:{action:'transfer',id:$('asEmp').value,branch_id:$('asBranch').value||null,department_id:$('asDept').value||null,section_id:$('asSection').value||null,job_title_id:$('asTitle').value||null,manager_id:$('asManager').value||null,supervisor_id:$('asSupervisor').value||null,reason:q($('asReason').value).trim()}});A.admin=null;await loadBootstrap();await loadCycleData();renderGrid();toast('تم تحديث التبعية');await svcTab('org');}catch(e){toast(humanError(e.message));}};

  async function svcRoles(b){var a=await loadAdmin();var customForm='<div class="em-add"><div class="em-inp-wrap"><input id="rlName" class="em-inp" style="padding:0 14px" placeholder="اسم الدور"></div><div class="em-inp-wrap"><input id="rlCode" class="em-inp" style="padding:0 14px;direction:ltr" placeholder="custom_role"></div><button class="em-addbtn" onclick="svcCreateRole()">إنشاء دور</button></div>';var rp={};(a.role_permissions||[]).forEach(function(x){rp[x.role_id+'|'+x.permission_id]=1;});var blocks=(a.roles||[]).map(function(r){var sys=r.is_system?'<span class="cr-src role">دور نظام — للعرض فقط</span>':'';var checks=(a.permissions||[]).map(function(p){var on=!!rp[r.id+'|'+p.id];return '<label style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #f0f2f6"><input type="checkbox" '+(on?'checked':'')+' '+(r.is_system?'disabled':'')+' onchange="svcRolePerm('+idjs(r.id)+','+idjs(p.id)+',this.checked)"><span><b style="font-size:.78rem">'+h(p.name_ar||p.code)+'</b><small style="display:block;color:var(--text3);font-size:.67rem">'+h(p.code)+'</small></span></label>';}).join('');return '<div class="cr-item role-perm-card" style="display:block;padding:0;overflow:hidden"><button type="button" class="role-perm-toggle" data-role-id="'+h(r.id)+'"><span class="role-perm-arrow" id="roleArrow_'+h(r.id)+'">⌄</span><b>'+h(r.name_ar)+'</b>'+sys+'</button><div id="rolePerm_'+h(r.id)+'" style="display:none;padding:0 12px 8px">'+checks+'</div></div>';}).join('');b.innerHTML=customForm+blocks;}
  window.toggleRolePerm=function(id){var b=$('rolePerm_'+id),a=$('roleArrow_'+id);if(!b)return;var open=b.style.display==='none';document.querySelectorAll('#svcBody [id^="rolePerm_"]').forEach(function(panel){if(panel===b)return;panel.style.display='none';var otherId=panel.id.slice('rolePerm_'.length),otherArrow=$('roleArrow_'+otherId);if(otherArrow)otherArrow.textContent='⌄';});b.style.display=open?'block':'none';if(a)a.textContent=open?'⌃':'⌄';};
  window.svcCreateRole=async function(){try{await api('/api/app/admin',{method:'POST',body:{action:'create_role',name_ar:q($('rlName').value).trim(),code:q($('rlCode').value).trim().toLowerCase()}});A.admin=null;toast('تم إنشاء الدور');await svcTab('roles');}catch(e){toast(humanError(e.message));}};
  window.svcRolePerm=async function(roleId,permissionId,enabled){try{await api('/api/app/admin',{method:'POST',body:{action:'set_role_permission',role_id:roleId,permission_id:permissionId,enabled:enabled}});toast('تم تحديث الصلاحية');A.admin=null;}catch(e){toast(humanError(e.message));await svcTab('roles');}};

  async function svcSettings(b){var a=await loadAdmin(),map={};(a.settings||[]).forEach(function(x){map[x.key]=x.value;});var target=(map.sales_target_default!=null?map.sales_target_default:setting('sales_target_default',100000)),mode=map.branch_target_mode||setting('branch_target_mode','individual');b.innerHTML='<div class="em-add" style="display:block"><label class="lg-lbl">الهدف البيعي الافتراضي</label><input id="setTarget" class="em-inp" style="padding:0 14px;direction:ltr;margin-bottom:14px" type="number" value="'+h(target)+'"><label class="lg-lbl">طريقة هدف الفرع</label><select id="setBranchMode" class="em-inp" style="padding:0 14px;margin-bottom:14px"><option value="individual" '+(mode==='individual'?'selected':'')+'>فردي</option><option value="branch_share" '+(mode==='branch_share'?'selected':'')+'>حصة من هدف الفرع</option><option value="manual" '+(mode==='manual'?'selected':'')+'>يدوي</option></select><button class="em-addbtn" onclick="svcSaveSettings()">حفظ الإعدادات</button></div>';}
  window.svcSaveSettings=async function(){try{var t=Number($('setTarget').value);await api('/api/app/admin',{method:'POST',body:{action:'save_setting',key:'sales_target_default',value:t,description:'الهدف البيعي الافتراضي'}});await api('/api/app/admin',{method:'POST',body:{action:'save_setting',key:'branch_target_mode',value:$('setBranchMode').value,description:'طريقة احتساب هدف الفرع'}});A.admin=null;await loadBootstrap();toast('تم حفظ الإعدادات');}catch(e){toast(humanError(e.message));}};

  async function svcReports(b){var mo=selectedMonth();b.innerHTML='<div class="em-empty" style="padding:24px"><b style="display:block;color:var(--text);font-size:1rem;margin-bottom:8px">تقارير '+(mo?MONTHS[mo.m-1]+' '+mo.y:'كل الفترات')+'</b><span style="display:block;margin-bottom:16px">تقرير الأداء + الأهداف + الحضور من البيانات المعتمدة في Neon.</span><button class="em-addbtn" onclick="serverExport()">تصدير Excel من قاعدة البيانات</button></div>';}
  window.serverExport=function(){if(!can('reports.export')){toast('ليست لديك صلاحية التصدير');return;}var mo=selectedMonth(),url='/api/app/reports?format=xlsx';if(mo)url+='&year='+encodeURIComponent(mo.y)+'&month='+encodeURIComponent(mo.m);window.location.href=url;};

  async function svcAudit(b){var j=await api('/api/app/audit?limit=100');b.innerHTML=(j.logs||[]).map(function(x){return row(x.user_name||x.user_email||'النظام',(x.action||'')+' · '+(x.entity_type||'')+' · '+new Date(x.created_at).toLocaleString('ar-SA'),'');}).join('')||'<div class="em-empty">لا توجد عمليات</div>';}
  async function svcNotifications(b){var j=await api('/api/app/notifications');A.notifications=j.notifications||[];var unread=A.notifications.filter(function(n){return !n.read_at;}).length;var head=unread?'<div class="em-add"><button class="em-addbtn" onclick="svcReadAll()">تعليم الكل كمقروء</button></div>':'';b.innerHTML=head+A.notifications.map(function(n){return row(n.title,(n.read_at?'':'غير مقروء · ')+(n.body||''),'');}).join('')||'<div class="em-empty">لا توجد إشعارات</div>';}
  window.svcReadAll=async function(){try{await api('/api/app/notifications',{method:'PATCH',body:{all:true}});await svcTab('notifications');}catch(e){toast(humanError(e.message));}};
  async function svcPortal(b){var j=await api('/api/app/portal');A.portal=j;if(!j.employee){b.innerHTML='<div class="em-empty">هذا الحساب غير مربوط بموظف</div>';return;}var html='<div class="sec-head"><span class="sh-t">'+h(j.employee.full_name)+'</span><span class="sh-n">'+h(j.employee.job_titles&&j.employee.job_titles.name||'')+'</span></div>';html+=(j.evaluations||[]).map(function(e){var c=e.evaluation_cycles||{};return row('تقييم الأداء · '+(c.name||''),'الدرجة '+(e.final_score==null?'—':e.final_score)+' · '+(e.result_label||'')+(e.notes?' · '+e.notes:''),'');}).join('');html+=(j.targets||[]).map(function(t){var c=t.evaluation_cycles||{},pct=Number(t.target_amount)?Math.round(Number(t.achieved_amount)/Number(t.target_amount)*1000)/10:0;return row('الهدف البيعي · '+(c.name||''),'المحقق '+Number(t.achieved_amount).toLocaleString('en-US')+' من '+Number(t.target_amount).toLocaleString('en-US')+' · '+pct+'%','');}).join('');html+=(j.attendance||[]).map(function(a){var c=a.evaluation_cycles||{};return row('الحضور · '+(c.name||''),'الدرجة '+a.final_score+'/100'+(a.notes?' · '+a.notes:''),'');}).join('');try{var fm=await api('/api/app/employees/'+encodeURIComponent(j.employee.id)+'/forms');(fm.documents||[]).forEach(function(d){html+=row('نموذج إداري · '+(d.form_type||''),'رقم '+(d.document_no||'')+' · '+(d.status||''),'');});}catch(_e){}b.innerHTML=html||'<div class="em-empty">لا توجد نتائج منشورة بعد</div>';}

  /* ---------- Startup ---------- */
  buildLoginUI();
  window.addEventListener('load',function(){restoreSession();});
})();

