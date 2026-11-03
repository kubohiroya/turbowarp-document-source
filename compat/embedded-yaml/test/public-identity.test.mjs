import assert from 'node:assert/strict';
import test from 'node:test';
import * as legacy from '../dist/index.js';
import * as documents from '@kubohiroya/turbowarp-document-data/document-source';
import * as legacyYaml from '../dist/yaml-source-view.js';
import * as yaml from '@kubohiroya/turbowarp-yaml-json/source-view';

test('legacy entry points re-export the installed implementation without a second registry',()=>{
  assert.equal(legacy.createEmbeddedYamlHatDefinition,documents.createEmbeddedYamlHatDefinition);
  assert.equal(legacy.getProviderRegistry,documents.getProviderRegistry);
  assert.equal(legacy.EmbeddedYamlError,documents.EmbeddedYamlError);
  assert.equal(legacyYaml.createYamlSourceBlockView,yaml.createYamlSourceBlockView);
  const host={};
  assert.equal(legacy.getProviderRegistry(host),documents.getProviderRegistry(host));
  legacy.getProviderRegistry(host).dispose();
});
