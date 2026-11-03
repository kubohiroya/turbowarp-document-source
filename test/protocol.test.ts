import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as contract from '../src/index.ts';

test('opaque references preserve the existing wire format and fail closed', () => {
  const reference={providerId:'owner:日本', documentId:'docs/a:b %20'};
  const wire=contract.encodeReference(reference);
  assert.equal(wire,'tw-embedded-yaml:1:owner%3A%E6%97%A5%E6%9C%AC:docs%2Fa%3Ab%20%2520');
  assert.deepEqual(contract.decodeReference(wire),reference);
  assert.ok(Object.isFrozen(contract.decodeReference(wire)));
  for(const invalid of ['',wire+':extra','tw-embedded-yaml:2:a:b','tw-embedded-yaml:1:a:%ZZ'])
    assert.throws(()=>contract.decodeReference(invalid),{code:'REFERENCE_INVALID'});
});

test('source descriptors separate location and representation without touching a host', () => {
  assert.deepEqual(contract.documentSourceModes,['embedded-file','url','yaml-blocks','schema-blocks']);
  for(const kind of contract.documentSourceModes){
    const descriptor=contract.normalizeDocumentSource({kind,filename:'docs/main.yaml',...(kind==='url'?{url:'https://example.test/main.yaml'}:{})});
    assert.equal(descriptor.location,kind==='url'?'https':'sb3');
    assert.equal(descriptor.representation,kind==='url'||kind==='embedded-file'?'source':kind);
    assert.ok(Object.isFrozen(descriptor));
  }
  assert.throws(()=>contract.normalizeDocumentSourceURL('http://example.test/main.yaml'),{code:'SOURCE_URL_INVALID'});
});

test('schema and preview values enforce the shared declarative boundary', () => {
  let invoked=false;
  const schema={id:'test',schema:{type:'object'}};
  const normalized=contract.normalizeSourceDocumentSchema(schema);
  assert.ok(Object.isFrozen(normalized.schema));
  assert.notEqual(normalized.schema,schema.schema);
  assert.throws(()=>contract.normalizeSourceDocumentSchema({id:'test',schema:{get type(){invoked=true;return 'object';}}}),{code:'SCHEMA_INVALID'});
  assert.equal(invoked,false);
  assert.throws(()=>contract.normalizeSourceDocumentPreview({kind:'yaml-blocks',source:'a: 1',project:{}},'yaml-blocks'),{code:'DOCUMENT_PREVIEW_INVALID'});
});

test('the provider protocol symbol stays stable and the contract has no implementation dependencies', async () => {
  assert.equal(contract.sourceDocumentRegistrySymbol,Symbol.for('@kubohiroya/turbowarp-embedded-yaml/provider-registry/v1'));
  assert.equal(contract.providerRegistrySymbol,contract.sourceDocumentRegistrySymbol);
  const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  for(const kind of ['dependencies','devDependencies','peerDependencies','optionalDependencies'])
    for(const name of Object.keys(manifest[kind]??{}))
      assert.ok(!/turbowarp-(?:document-data|yaml-json)/.test(name),kind+': '+name);
  for(const name of ['getDocumentSourceRegistry','createProviderRegistry','fetchDocumentSource','installDocumentSourceMarker'])
    assert.equal(name in contract,false,name+' belongs to the implementation');
});
