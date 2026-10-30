import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, cp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as shared from '../index.js';
import * as documents from '@kubohiroya/turbowarp-document-data/composition';
const ref = {providerId: 'example-provider', documentId: 'main'};
const code = expected => error => error.code === expected;
const makeProvider = (id = 'example-provider') => {
    const sources = new Map([['main', '# keep comment\nvalue: one\n'], ['settings', 'enabled: true\n']]);
    const state = {closed: 0, disposed: 0, unsubscribed: 0, changed: null};
    const provider = {id, hatOpcodes: [`${id}_embeddedYaml`],
        list: () => [...sources.keys()].map(documentId => ({documentId, filename: 'same-name.yaml'})),
        open(documentId) { return {
            inspect: () => ({available: true}), capture: () => ({source: sources.get(documentId)}),
            async prepare(snapshot, source) { return {source}; }, async commit(snapshot, prepared) { sources.set(documentId, prepared.source); return {source: prepared.source}; },
            dispose() { state.closed++; }
        }; },
        subscribe(listener) { state.changed = listener; return () => { state.unsubscribed++; }; },
        dispose() { state.disposed++; }
    };
    return {provider, state, sources};
};

test('legacy exports are exact aliases of the canonical Document Data contract', () => {
    assert.equal(shared.getProviderRegistry, documents.getSourceDocumentRegistry);
    assert.equal(shared.createProviderRegistry, documents.createSourceDocumentRegistry);
    assert.equal(shared.encodeReference, documents.encodeSourceDocumentReference);
    assert.equal(shared.decodeReference, documents.decodeSourceDocumentReference);
    assert.equal(shared.EmbeddedYamlError, documents.SourceDocumentError);
    assert.equal(shared.normalizeSchemaMetadata, documents.normalizeSourceDocumentSchema);
    assert.equal(shared.embeddedYamlSchemaLimits, documents.sourceDocumentSchemaLimits);
    assert.equal(shared.providerRegistrySymbol, Symbol.for('@kubohiroya/turbowarp-embedded-yaml/provider-registry/v1'));
    const vm = {};
    assert.equal(shared.getProviderRegistry(vm), documents.getSourceDocumentRegistry(vm));
});

test('references roundtrip opaque IDs, including unicode and delimiter characters', () => {
    const value = shared.encodeReference({providerId: 'owner:日本', documentId: 'docs/a:b %20'});
    assert.deepEqual(shared.decodeReference(value), {providerId: 'owner:日本', documentId: 'docs/a:b %20'});
    assert.ok(Object.isFrozen(shared.decodeReference(value)));
    for (const bad of ['', 'javascript:alert(1)', value+'extra:', 'tw-embedded-yaml:2:a:b', 'tw-embedded-yaml:1:a:%ZZ']) assert.throws(() => shared.decodeReference(bad), code('REFERENCE_INVALID'));
    assert.throws(() => shared.encodeReference({providerId: 'owner', documentId: ''}), code('REFERENCE_INVALID'));
});

test('inert document hat uses a filename dropdown with only actual references', () => {
    const definition = shared.createEmbeddedYamlHatDefinition({BlockType: {HAT: 'hat'}, defaultReference: ref});
    assert.equal(definition.text, 'embedded YAML [DOCUMENT]'); assert.equal(definition.isEdgeActivated, false);
    assert.deepEqual(Object.keys(definition.arguments), ['DOCUMENT']);
    assert.equal(shared.decodeReference(definition.arguments.DOCUMENT.defaultValue).documentId, 'main');
    const docs = ['main','settings'].map(documentId => ({reference: {...ref,documentId},filename:'same.yaml'}));
    const menu = shared.createEmbeddedYamlDocumentMenu(docs); assert.equal(menu.acceptReporters, false);
    assert.deepEqual(menu.items.map(item=>item.text), ['same.yaml','same.yaml']); assert.notEqual(menu.items[0].value,menu.items[1].value);
    assert.deepEqual(shared.createEmbeddedYamlDocumentMenu([]).items,[{text:'—',value:''}]);
    assert.throws(()=>shared.createEmbeddedYamlDocumentMenu([docs[0],docs[0]]),code('DOCUMENT_DUPLICATE'));
});

test('code-native icon data URI exactly matches the supplied SVG asset', async () => {
    assert.equal(decodeURIComponent(shared.embeddedYamlFileIconURI.split(',')[1]),(await readFile(new URL('../assets/yaml-file.svg',import.meta.url),'utf8')).trim());
    assert.match(decodeURIComponent(shared.embeddedYamlFileIconURI),/>YAML<\/text>/);
});

test('reads the actual nonreporter VM direct field and serialized field without evaluating anything', () => {
    const value=shared.encodeReference(ref);
    assert.deepEqual(shared.readReference({fields:{DOCUMENT:{name:'DOCUMENT',value}}}),ref);
    assert.deepEqual(shared.readReference({fields:{DOCUMENT:[value,null]}}),ref);
    assert.deepEqual(shared.readReference({getFieldValue:name=>name==='DOCUMENT'?value:null}),ref);
});

test('legacy literal shadows are supported while reporters and ambiguous values are rejected', () => {
    const value=shared.encodeReference(ref), shadow={shadow:true,opcode:'text',fields:{TEXT:{value}}};
    assert.deepEqual(shared.readReference({inputs:{DOCUMENT:{block:'s',shadow:'s'}}},{blocks:{getBlock:id=>id==='s'?shadow:null}}),ref);
    assert.deepEqual(shared.readReference({inputs:{DOCUMENT:[1,[10,value]]}}),ref);
    assert.throws(()=>shared.readReference({inputs:{DOCUMENT:{block:'reporter',shadow:'s'}}},{blocks:{}}),code('REFERENCE_REPORTER'));
    assert.throws(()=>shared.readReference({getFieldValue:()=>null,getInputTargetBlock:()=>({isShadow:()=>false,getFieldValue(){throw Error('must not execute');}})}),code('REFERENCE_REPORTER'));
    assert.throws(()=>shared.readReference({fields:{DOCUMENT:['invalid']},inputs:{DOCUMENT:[1,[10,value]]}}),code('REFERENCE_INVALID'));
});

test('multiple source owners and same-name documents resolve to their own independent adapters', async () => {
    const registry=shared.createProviderRegistry(),a=makeProvider(),b=makeProvider('other-owner');
    registry.register(a.provider);registry.register(b.provider);assert.equal(registry.list().length,4);
    const first=registry.open(ref),other=registry.open({...ref,documentId:'settings'});
    const snapshot=first.capture();const raw=snapshot.source+'# user edit\n';await first.commit(snapshot,await first.prepare(snapshot,raw));
    assert.equal(a.sources.get('main'),raw);assert.equal(other.capture().source,'enabled: true\n');assert.equal(b.sources.get('main'),'# keep comment\nvalue: one\n');
    assert.deepEqual(registry.getHatOpcodes(),['example-provider_embeddedYaml','other-owner_embeddedYaml']);registry.dispose();
});

test('unknown providers/documents, duplicate owners and duplicate document IDs fail closed', () => {
    const registry=shared.createProviderRegistry(),f=makeProvider();registry.register(f.provider);
    assert.throws(()=>registry.open({providerId:'missing',documentId:'main'}),code('PROVIDER_UNKNOWN'));
    assert.throws(()=>registry.open({...ref,documentId:'missing'}),code('DOCUMENT_UNKNOWN'));
    assert.throws(()=>registry.register(f.provider),code('PROVIDER_DUPLICATE'));
    assert.throws(()=>registry.register({id:'duplicate-docs',list:()=>[{documentId:'x',filename:'a'},{documentId:'x',filename:'b'}],open(){}}),code('DOCUMENT_DUPLICATE'));
    assert.equal(registry.list().length,2);registry.dispose();
});

test('unavailable metadata retains an owner-provided reason', () => {
    const registry=shared.createProviderRegistry();registry.register({id:'owner',list:()=>[{documentId:'x',filename:'x.yaml',available:false,reason:'Owner validation failed.'}],open(){throw Error('must not open');}});
    assert.throws(()=>registry.open({providerId:'owner',documentId:'x'}),error=>error.code==='DOCUMENT_UNAVAILABLE'&&error.message==='Owner validation failed.');registry.dispose();
});

test('unregister and dispose close open adapters, unsubscribe providers and notify observers once', async () => {
    const registry=shared.createProviderRegistry(),f=makeProvider();let updates=0;const stop=registry.subscribe(()=>updates++);
    const unregister=registry.register(f.provider);const adapter=registry.open(ref);assert.equal(updates,1);f.state.changed();assert.equal(updates,2);
    unregister();unregister();assert.equal(f.state.closed,1);assert.equal(f.state.disposed,1);assert.equal(f.state.unsubscribed,1);assert.equal(updates,3);
    adapter.dispose();assert.equal(f.state.closed,1);assert.equal(adapter.inspect().available,false);await assert.rejects(adapter.prepare({source:''},''),code('DOCUMENT_CLOSED'));stop();registry.dispose();
});

test('pending preparation cannot become a usable result after its provider is removed', async () => {
    const registry=shared.createProviderRegistry();let done;let disposed=0;
    const unregister=registry.register({id:'owner',list:()=>[{documentId:'x',filename:'x.yaml'}],open:()=>({inspect:()=>({available:true}),capture:()=>({source:''}),prepare:()=>new Promise(resolve=>{done=resolve;}),commit:async()=>({source:''}),dispose(){disposed++;}})});
    const adapter=registry.open({providerId:'owner',documentId:'x'});const pending=adapter.prepare(adapter.capture(),'new');unregister();done({source:'new'});await assert.rejects(pending,code('DOCUMENT_CLOSED'));assert.equal(disposed,1);registry.dispose();
});

test('independently bundled package copies share only the same runtime-local scope', async () => {
    const temporary=await mkdtemp(path.join(tmpdir(),'embedded-yaml-copies-'));
    try {
        const copy=path.join(temporary,'package');await cp(new URL('../',import.meta.url),copy,{recursive:true});
        const second=await import(pathToFileURL(path.join(copy,'index.js')).href);
        const vm={},otherVM={};const first=shared.getProviderRegistry(vm);assert.equal(second.getProviderRegistry(vm),first);assert.notEqual(second.getProviderRegistry(otherVM),first);
        first.register(makeProvider().provider);assert.equal(second.getProviderRegistry(vm).list().length,2);assert.equal(Object.keys(vm).length,0);
        first.dispose();assert.notEqual(shared.getProviderRegistry(vm),first);shared.getProviderRegistry(vm).dispose();second.getProviderRegistry(otherVM).dispose();
    } finally {await rm(temporary,{recursive:true,force:true});}
});

test('Stage markers contain references only, preserve storage, and distinguish multiple documents', () => {
    const project={targets:[{isStage:true,blocks:{start:{opcode:'event_whenflagclicked',topLevel:true,y:0}}}],extensionStorage:{owner:{source:'# canonical\n'}}};
    const before=JSON.stringify(project.extensionStorage);const first=shared.installEmbeddedYamlMarker(project,{opcode:'owner_embeddedYaml',reference:ref});
    const second=shared.installEmbeddedYamlMarker(project,{opcode:'owner_embeddedYaml',reference:{...ref,documentId:'settings'}});
    assert.notEqual(first,second);assert.equal(shared.installEmbeddedYamlMarker(project,{opcode:'owner_embeddedYaml',reference:ref}),first);
    assert.deepEqual(shared.readReference(project.targets[0].blocks[first]),ref);assert.deepEqual(project.targets[0].blocks[first].inputs,{});assert.equal(JSON.stringify(project.extensionStorage),before);
    assert.equal(JSON.stringify(project.targets).includes('canonical'),false);
    assert.equal(shared.removeEmbeddedYamlMarkers(project,{opcodes:['owner_embeddedYaml']}),2);assert.deepEqual(Object.keys(project.targets[0].blocks),['start']);
});

test('removing a source marker preserves a user command and its comment', () => {
    const project={targets:[{isStage:true,blocks:{},comments:{}}]};const target=project.targets[0];const id=shared.installEmbeddedYamlMarker(project,{opcode:'owner_embeddedYaml',reference:ref});
    target.blocks[id].next='body';target.blocks.body={opcode:'looks_show',parent:id};target.comments.marker={blockId:id};target.comments.body={blockId:'body'};
    shared.removeEmbeddedYamlMarkers(project,{opcodes:['owner_embeddedYaml']});assert.equal(target.blocks.body.parent,null);assert.equal(target.blocks.body.topLevel,true);assert.ok(target.comments.body);assert.equal(target.comments.marker,undefined);
});

test('inline Schema metadata is immutable, transported intact and never interpreted', () => {
    const input={id:'https://example.invalid/config.schema.json',schema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{enabled:{type:'boolean'}},$defs:{values:{enum:[true,false,null]}}}};
    const normalized=shared.normalizeSchemaMetadata(input);assert.deepEqual(normalized,input);assert.notEqual(normalized.schema,input.schema);assert.ok(Object.isFrozen(normalized.schema.properties.enabled));assert.ok(Object.isFrozen(normalized.schema.$defs.values.enum));
    const registry=shared.createProviderRegistry();registry.register({id:'owner',list:()=>[{documentId:'x',filename:'config.yaml',schema:input}],open(){}});assert.deepEqual(registry.list()[0].schema,input);registry.dispose();
    input.schema.properties.enabled.type='string';assert.equal(normalized.schema.properties.enabled.type,'boolean');
});

test('non-JSON, cyclic, accessor, sparse, oversized and overdeep Schema payloads are refused', () => {
    const cycle={};cycle.self=cycle;let access=0;const getter={get type(){access++;return 'object';}};
    const sparse=Array(1);sparse.custom=true;
    for(const schema of [{x:Infinity},{x:undefined},{x:1n},{x:()=>{}},cycle,getter,{x:sparse},new Date()])assert.throws(()=>shared.normalizeSchemaMetadata({id:'x',schema}));assert.equal(access,0);
    assert.throws(()=>shared.normalizeSchemaMetadata({id:'x',schema:{description:'あ'.repeat(400000)}}),code('SCHEMA_LIMIT'));
    let deep={};for(let i=0;i<70;i++)deep={item:deep};assert.throws(()=>shared.normalizeSchemaMetadata({id:'x',schema:deep}),code('SCHEMA_LIMIT'));
});
