import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDocumentSource, documentSourceModes, fetchDocumentSource, getDocumentSourceRegistry, readDocumentSourceURLs, writeDocumentSourceURL, createDocumentSourceHatDefinition, createDocumentSourceRootHatDefinition, registerEmbeddedYamlRootHatShape} from '../index.js';
import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {patchVm} from './helpers/patch-vm.mjs';

const reference = {providerId:'example', documentId:'file:main.yaml'};
const code = expected => error => error.code === expected;
function fixture({fetch = async () => new Response('# remote comment\nvalue: two\n')} = {}) {
    const project = {targets:[{isStage:true,name:'Stage',blocks:{unrelated:{opcode:'looks_show',topLevel:true,next:null,parent:null,inputs:{},fields:{},shadow:false}}}],extensionStorage:{example:{source:'# local\nvalue: one\n'},unrelated:{keep:true}}};
    const {vm,counts} = patchVm(project), registry = getDocumentSourceRegistry(vm);
    const candidates = new WeakMap();
    registry.register({id:'example',hatOpcodes:['example_dataSource'],list:()=>[{documentId:reference.documentId,filename:'main.yaml',format:'yaml',activeRepresentation:'source',representations:[{kind:'yaml-blocks',label:'YAML blocks',fromSource:true,toSource:true}]}],open:()=>({
        inspect:()=>({available:true}),capture:()=>({source:project.extensionStorage.example.source,sourceName:'main.yaml'}),
        async prepare(snapshot,source){if (!source.includes('value:')) throw Error('Schema validation failed.');const candidate={source};candidates.set(candidate,snapshot);return candidate;},
        async commit(snapshot,candidate){assert.equal(candidates.get(candidate),snapshot);project.extensionStorage.example.source=candidate.source;return {source:candidate.source};},
        dispose(){},
    })},{fetch,sourceStorageId:'example',dialogTitle:{ja:'サンプルデータ',en:'Sample data'},buildSourceCandidate({project,source}){
        if (!source.includes('value:')) throw Error('Schema validation failed.');
        project.extensionStorage.example.source=source;
        return {project,source};
    }});
    return {project,vm,counts,registry};
}

test('four kinds separate storage location from representation and keep a stable file name',()=>{
    assert.equal(documentSourceModes.length,4);
    for (const kind of documentSourceModes) {
        const source=normalizeDocumentSource({kind,filename:'parts/日本語.yaml',...(kind==='url'?{url:'https://example.test/story.yaml'}:{})});
        assert.equal(source.filename,'parts/日本語.yaml');
        assert.equal(source.location,kind==='url'?'https':'sb3');
        assert.equal(source.representation,['embedded-file','url'].includes(kind)?'source':kind);
    }
    for (const filename of ['', '../main.yaml', '/main.yaml', 'CON', 'two\\main.yaml']) assert.throws(()=>normalizeDocumentSource({kind:'embedded-file',filename}));
    for (const url of ['http://example.test/a.yaml','javascript:alert(1)','https://a:b@example.test/a','https://example.test/a#x']) assert.throws(()=>normalizeDocumentSource({kind:'url',filename:'a.yaml',url}),code('SOURCE_URL_INVALID'));
});

test('neutral hat names keep the disconnected root and reference-only declarations',()=>{
    const options={BlockType:{HAT:'hat'},defaultReference:reference};
    assert.equal(createDocumentSourceHatDefinition(options).text,'data source [DOCUMENT]');
    const root=createDocumentSourceRootHatDefinition({...options,defaultVersion:'4.0'});
    assert.equal(root.text,'data source root [VERSION] [DOCUMENT]');
    let initialize;registerEmbeddedYamlRootHatShape({Extensions:{register(_name,fn){initialize=fn;}}});
    const connections=[];initialize.call({setPreviousStatement:v=>connections.push(v),setNextStatement:v=>connections.push(v)});
    assert.deepEqual(connections,[false,false]);
});

test('URL loading omits credentials and redirects, bounds streamed bytes and validates UTF-8',async()=>{
    let options;
    assert.equal((await fetchDocumentSource('https://example.test/a.yaml',{fetch:async(_url,input)=>{options=input;return new Response('# comment\nx: 1\n');}})).source,'# comment\nx: 1\n');
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    await assert.rejects(fetchDocumentSource('https://example.test/a',{maxBytes:2,fetch:async()=>new Response('big')}),code('SOURCE_TOO_LARGE'));
    await assert.rejects(fetchDocumentSource('https://example.test/a',{fetch:async()=>new Response(new Uint8Array([255]))}),code('SOURCE_ENCODING_INVALID'));
    await assert.rejects(fetchDocumentSource('https://example.test/a',{fetch:async()=>new Response('no',{status:404})}),code('SOURCE_FETCH_FAILED'));
    const controller=new AbortController();controller.abort(new Error('cancelled'));
    await assert.rejects(fetchDocumentSource('https://example.test/a',{signal:controller.signal,fetch:async()=>new Response('ignored')}),/cancelled/);
});

test('shared registry decorates the one canonical owner and URL save is a partial atomic project patch',async()=>{
    const {project,vm,counts,registry}=fixture();
    assert.equal(getDocumentSourceRegistry(vm),registry);
    assert.equal(getSourceDocumentRegistry(vm).list().length,1);
    const unrelated=vm.runtime.targets[0].blocks.getBlock('unrelated'),sourceBefore=JSON.stringify(project);
    let adapter=registry.open(reference),snapshot=adapter.capture();
    const candidate=await adapter.prepareDataSource(snapshot,{kind:'url',url:'https://example.test/main.yaml'});
    assert.equal(JSON.stringify(project),sourceBefore);
    assert.equal(candidate.source,'# remote comment\nvalue: two\n');
    adapter.commitDataSource(snapshot,candidate);
    assert.equal(readDocumentSourceURLs(project)[0].url,'https://example.test/main.yaml');
    assert.equal(project.extensionStorage.example.source,candidate.source);
    assert.equal(registry.list()[0].dataSource.kind,'url');
    assert.equal(registry.list()[0].representations[0].available,false);
    assert.equal(registry.list()[0].dialogTitle.ja,'サンプルデータ');
    assert.equal(vm.runtime.targets[0].blocks.getBlock('unrelated'),unrelated);
    assert.deepEqual(project.extensionStorage.unrelated,{keep:true});
    assert.equal(counts.saves,0);assert.equal(counts.loads,0);assert.equal(counts.stops,0);
    adapter.dispose();adapter=registry.open(reference);
    assert.throws(()=>adapter.capture(),code('SOURCE_NOT_LOADED'));
    await adapter.loadSource();snapshot=adapter.capture();
    assert.equal(snapshot.source,candidate.source);
    await assert.rejects(adapter.prepare(snapshot,'value: edited'),code('SOURCE_URL_READ_ONLY'));
    const imported=await adapter.prepareDataSource(snapshot,{kind:'embedded-file'});
    adapter.commitDataSource(snapshot,imported);adapter.dispose();
    assert.equal(readDocumentSourceURLs(project).length,0);
    assert.equal(registry.list()[0].dataSource.kind,'embedded-file');
    assert.equal(project.extensionStorage.example.source,candidate.source);
    registry.dispose();
});

test('validation failure, project changes, foreign candidates and cancelled URL loads cannot write',async()=>{
    const {project,vm,registry}=fixture({fetch:async()=>new Response('invalid')});
    let adapter=registry.open(reference),snapshot=adapter.capture();const before=JSON.stringify(project);
    await assert.rejects(adapter.prepareDataSource(snapshot,{kind:'url',url:'https://example.test/a'}),/Schema/);
    assert.equal(JSON.stringify(project),before);
    const candidate=await adapter.prepareDataSource(snapshot,{kind:'embedded-file'});
    assert.throws(()=>adapter.commitDataSource(snapshot,{...candidate}),code('SOURCE_CANDIDATE_INVALID'));
    project.extensionStorage.unrelated.keep=false;
    assert.throws(()=>adapter.commitDataSource(snapshot,candidate),code('PROJECT_CONFLICT'));
    adapter.dispose();registry.dispose();

    let finish;
    const second=fixture({fetch:()=>new Promise(resolve=>{finish=resolve;})});
    writeDocumentSourceURL(second.project,reference,'https://example.test/a','example');
    adapter=second.registry.open(reference);const pending=adapter.loadSource();adapter.dispose();finish(new Response('value: late'));
    await assert.rejects(pending);assert.equal(second.project.extensionStorage.example.source,'# local\nvalue: one\n');
    second.registry.dispose();
});

test('SB3 serialization preserves URL identity and rejects malformed source records',()=>{
    const project={extensionStorage:{example:{}}};writeDocumentSourceURL(project,reference,'https://example.test/main.yaml','example');
    assert.deepEqual(readDocumentSourceURLs(JSON.parse(JSON.stringify(project))),[{reference,url:'https://example.test/main.yaml',ownerExtensionId:'example'}]);
    assert.throws(()=>readDocumentSourceURLs({extensionStorage:{example:{documentSourceLocations:{formatVersion:2,urls:{}}}}}),code('SOURCE_STORAGE_INVALID'));
});

test('the legacy package is a facade of the same implementation and registry', {skip: !process.env.TW_LEGACY_EMBEDDED_YAML}, async()=>{
    const old=await import(pathToFileURL(path.join(process.env.TW_LEGACY_EMBEDDED_YAML, 'index.js')).href);
    const current=await import('../index.js');
    assert.equal(old.createEmbeddedYamlHatDefinition,current.createEmbeddedYamlHatDefinition);
    assert.equal(old.registerEmbeddedYamlRootHatShape,current.registerEmbeddedYamlRootHatShape);
    const vm={};
    assert.equal(old.getProviderRegistry(vm),current.getProviderRegistry(vm));
    old.getProviderRegistry(vm).dispose();
});
