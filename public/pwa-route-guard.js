// An installed PWA opens the app in the URL language before the landing paints.
(function(){try{var s=(typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;var m=location.pathname.match(/^\/(es|pt)?\/?$/);if(s&&m){location.replace((m[1]?'/'+m[1]:'')+'/app'+location.search+location.hash);}}catch(_error){}})();
