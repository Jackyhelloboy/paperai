const assert=require('node:assert/strict');

(async()=>{
 const guard=await import('../worker/src/ocr-output-guard.js');
 const initial='[[SECTION_ROW: IV. चित्र पहचानो || 4]]\n[[FIGURE: 100,200,140,120|1.|none]]\n[[FIGURE_ROW: 300,200,140,120|2.|none || 500,200,140,120|3.|none]]';
 const verified='[[SECTION_ROW: IV. चित्र पहचानो || 4]]\n[[FIGURE_ROW: 100,200,140,120|1.|none || 300,200,140,120|2.|none || 500,200,140,120|3.|none]]';
 assert(guard.figureLayoutChanged(initial,verified),'A corrected three-up row must be eligible for guarded verification');
 assert(!guard.figureLayoutChanged(verified,verified),'Identical rows do not replace transcription');
 assert(!guard.figureLayoutChanged(initial,'[[FIGURE_ROW: 999,999,140,120|1.|none || 300,200,140,120|2.|none]]'),'Invalid out-of-page crops cannot be accepted');
 assert(!guard.figureLayoutChanged(initial,'No pictures seen'),'A second reader cannot erase all drawings');
 const missing=verified.replace(' || 500,200,140,120|3.|none',' || 500,200,140,120|3.|none || 700,200,120,130|4.|none');
 assert(guard.figureLayoutChanged(verified,missing),'A verified additional illustration must be eligible');
 const firstText='[[SECTION_ROW: IV. चित्र पहचानो || 4]]\n1. कमल\n'+initial;
 const lostText='[[SECTION_ROW: IV. चित्र पहचानो || 4]]\n'+verified;
 assert(guard.losesSourceQuestions(firstText,lostText),'A verified layout cannot bypass the question guard');
 console.log('verified figure layout safeguards passed');
})().catch(error=>{console.error(error);process.exitCode=1});
