import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("migration must retain original appId and updater/push native plugins",()=>{
 const cap=JSON.parse(read("capacitor.config.json"));
 const pkg=JSON.parse(read("package.json"));
 assert.equal(cap.appId,"pt.rjp.trainlive");
 assert.ok(pkg.dependencies["@capgo/capacitor-updater"]);
 assert.ok(pkg.dependencies["@capacitor/push-notifications"]);
 assert.ok(pkg.dependencies["@capacitor/local-notifications"]);
});
test("migration is gated and original push/alert state remains intact",()=>{
 const main=read("src/main.jsx");
 assert.match(main,/VITE_RJP_V2_MIGRATION==="1"/);
 assert.match(main,/rjp_train_v2_pilot_opt_in/);
 assert.match(main,/pilotModeRef\.current/);
 assert.match(main,/Voltar à original \(estável\)/);
 assert.match(main,/fetchIndependentTrains/);
 assert.match(main,/getSavedAlerts/);
 assert.match(main,/initPush/);
 assert.match(read("src/alerts.js"),/rjp_train_alerts_v26/);
 assert.match(read("src/push.js"),/rjp_push_device_v27/);
 assert.doesNotMatch(read("src/v2/independent-feed.js"),/localStorage\.(clear|removeItem)/);
});
test("the production OTA manifest is untouched",()=>{
 const m=JSON.parse(read("ota/manifest.json"));
 assert.equal(m.appId,"pt.rjp.trainlive");
 assert.match(m.version,/^\d+\.\d+\.\d+$/);
 assert.ok(m.version.split(".").map(Number).reduce((acc,n)=>acc*1000+n,0)>=2012039);
});

test("legacy FCM alert source is preserved even when independent map is on",()=>{
 const main=read("src/main.jsx");
 assert.match(main,/fetchOriginalFeed\(\)\.then\(\(\{trains\}\)=>/);
 assert.match(main,/dispatchAlerts\(trains,getSavedAlerts\(\),new Date\(\),sendAlert\)/);
 assert.doesNotMatch(main,/dispatchAlerts\(independent\.alertEligible/);
});
test("pilot selection does not reclassify GTFS-only markers as GPS",()=>{
 const main=read("src/main.jsx");
 assert.match(main,/t\.positionKind==="timetable-estimated"/);
 assert.match(main,/border:2px '\+border/);
});
