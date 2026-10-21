const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const launcher = path.resolve(__dirname, '../启动游戏.cmd');

test('Windows launcher stays ASCII with CRLF command boundaries', () => {
  const bytes=fs.readFileSync(launcher);
  assert.ok(bytes.every(byte=>byte<128),'cmd.exe must not parse multibyte text as commands');
  assert.ok(!/(?<!\r)\n/.test(bytes.toString('ascii')),'batch files must use CRLF');
});

// Use the real Windows command interpreter, including a path with spaces and Chinese.
async function runLauncher(t, {server, noNode=false}) {
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'gwent-launcher-'));
  const fixture=path.join(tempRoot,'中文 game directory');
  fs.mkdirSync(fixture);
  const script=path.join(fixture,'启动游戏.cmd');
  fs.copyFileSync(launcher,script);
  if(server!==undefined) fs.writeFileSync(path.join(fixture,'server.cjs'),server);
  const system32=path.join(process.env.SystemRoot,'System32');
  const child=spawn(process.env.ComSpec||path.join(system32,'cmd.exe'),['/d','/s','/c',`""${script}""`],{
    cwd:os.tmpdir(),windowsHide:true,windowsVerbatimArguments:true,
    env:{...process.env,PATH:noNode?system32:`${path.dirname(process.execPath)};${system32}`},
    stdio:['pipe','pipe','pipe']
  });
  let output='';
  const complete=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
  t.after(async()=>{
    child.stdin.end('\r\n');
    await complete;
    assert.equal(path.dirname(tempRoot),os.tmpdir());
    assert.ok(path.basename(tempRoot).startsWith('gwent-launcher-'));
    fs.rmSync(tempRoot,{recursive:true,force:true});
  });
  const paused=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Launcher never reached its pause: '+output)),8000);
    function collect(chunk){
      output+=chunk.toString('utf8');
      if(output.includes('Press any key to close this window...')){clearTimeout(timer);resolve();}
    }
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    complete.then(()=>{clearTimeout(timer);reject(new Error('Launcher closed before pause: '+output));},reject);
  });
  await paused;
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(child.exitCode,null,'window must remain open until the user presses a key');
  child.stdin.end('\r\n');
  return {output,code:await complete,fixture};
}

test('double-click command works from another directory, with spaces and Chinese in its path', {skip:process.platform!=='win32'}, async t=>{
  const result=await runLauncher(t,{server:'console.log("SERVER_READY " + process.cwd()); console.log("ARGS " + process.argv.slice(2).join(" "));'});
  assert.equal(result.code,0);
  assert.ok(result.output.includes('SERVER_READY '+result.fixture));
  assert.match(result.output,/ARGS --open/);
  assert.doesNotMatch(result.output,/not recognized/);
});

test('missing Node.js displays an error and keeps the launcher open', {skip:process.platform!=='win32'}, async t=>{
  const result=await runLauncher(t,{noNode:true});
  assert.equal(result.code,1);assert.match(result.output,/Node\.js was not found/);
});

test('missing server and server failure preserve diagnostic output', {skip:process.platform!=='win32'}, async t=>{
  const missing=await runLauncher(t,{});
  assert.equal(missing.code,1);assert.match(missing.output,/server\.cjs is missing/);
  const failure=await runLauncher(t,{server:'console.error("SERVER_FAILURE_DETAIL"); process.exitCode=42;'});
  assert.equal(failure.code,42);assert.match(failure.output,/SERVER_FAILURE_DETAIL/);
  assert.match(failure.output,/game server failed to start/);
});
