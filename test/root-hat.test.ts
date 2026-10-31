import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmbeddedYamlHatDefinition,createEmbeddedYamlRootHatDefinition,createEmbeddedYamlRootVersionMenu,registerEmbeddedYamlRootHatShape,embeddedYamlRootShapeExtension,createEmbeddedYamlRootMarker,validateEmbeddedYamlRootMarker,installEmbeddedYamlRootMarker,validateEmbeddedYamlFilename,validateEmbeddedYamlRelativePath,type EmbeddedYamlRootShapeHost} from '../src/index.ts';
const reference={providerId:'owner',documentId:'story'};
const options={BlockType:{HAT:'hat'},defaultReference:reference,defaultVersion:'4.0'};
test('root uses a standard shape extension to remove both connections and ordinary hat remains chainable',()=>{
 const root=createEmbeddedYamlRootHatDefinition(options),ordinary=createEmbeddedYamlHatDefinition(options);
 assert.equal(root.arguments.VERSION.defaultValue,'4.0');assert.equal(root.arguments.VERSION.menu,'embeddedYamlVersions');assert.deepEqual(createEmbeddedYamlRootVersionMenu(['4.0']),{acceptReporters:false,items:[{text:'4.0',value:'4.0'}]});assert.throws(()=>createEmbeddedYamlRootVersionMenu([]));assert.throws(()=>createEmbeddedYamlRootVersionMenu(['4.0','4.0']));assert.equal(root.text,'embedded YAML root [VERSION] [DOCUMENT]');assert.equal(root.blockType,'hat');assert.equal(root.isEdgeActivated,false);assert.equal(root.isTerminal,true);
 assert.deepEqual(root.extensions,[embeddedYamlRootShapeExtension]);assert.equal((ordinary as Record<string,unknown>).extensions,undefined);assert.equal((ordinary as Record<string,unknown>).isTerminal,undefined);
 const registered=new Map<string,Parameters<EmbeddedYamlRootShapeHost['Extensions']['register']>[1]>();const Blockly:EmbeddedYamlRootShapeHost={Extensions:{register(name,callback){assert.equal(registered.has(name),false);registered.set(name,callback);}}};
 registerEmbeddedYamlRootHatShape(Blockly);registerEmbeddedYamlRootHatShape(Blockly);assert.equal(registered.size,1);
 // Pinned VM first emits HAT's nextStatement:null; ScratchBlocks applies JSON extensions afterward.
 const block:{previousConnection:unknown;nextConnection:unknown;setPreviousStatement(enabled:boolean):void;setNextStatement(enabled:boolean):void}={previousConnection:null,nextConnection:{},setPreviousStatement(enabled){assert.equal(enabled,false);this.previousConnection=null;},setNextStatement(enabled){assert.equal(enabled,false);this.nextConnection=null;}};
 registered.get(root.extensions[0])!.call(block);assert.equal(block.previousConnection,null);assert.equal(block.nextConnection,null);
 assert.equal(root.arguments.DOCUMENT.defaultValue,ordinary.arguments.DOCUMENT.defaultValue);
});
test('root marker is an independent reference and install refuses silent root changes or attached bodies',()=>{
 const project:{targets:{isStage:boolean;blocks:Record<string,Record<string,unknown>>;comments:Record<string,unknown>}[]}={targets:[{isStage:true,blocks:{ordinary:{opcode:'owner_embeddedYaml',next:'body'}},comments:{}}]};
 const rootOptions={opcode:'owner_embeddedYamlRoot',reference,version:'4.0'};
 const id=installEmbeddedYamlRootMarker(project,rootOptions);
 assert.equal(installEmbeddedYamlRootMarker(project,rootOptions),id);assert.deepEqual(validateEmbeddedYamlRootMarker(project.targets[0].blocks[id],rootOptions),reference);
 assert.equal(project.targets[0].blocks.ordinary.next,'body');
 const before=structuredClone(project);
 assert.throws(()=>installEmbeddedYamlRootMarker(project,{...rootOptions,reference:{...reference,documentId:'other'}}),{code:'ROOT_MARKER_INVALID'});assert.deepEqual(project,before);
 for(const corrupt of [b=>b.next='body',b=>b.parent='body',b=>b.shadow=true,b=>b.topLevel=false,b=>b.inputs={SUBSTACK:[2,'body']}] satisfies ((b:Record<string,unknown>)=>unknown)[]){const block=createEmbeddedYamlRootMarker(rootOptions);corrupt(block);assert.throws(()=>validateEmbeddedYamlRootMarker(block,rootOptions),{code:'ROOT_MARKER_INVALID'});}
 const duplicate=structuredClone(project);duplicate.targets[0].blocks.another=createEmbeddedYamlRootMarker(rootOptions);assert.throws(()=>installEmbeddedYamlRootMarker(duplicate,rootOptions),{code:'ROOT_MARKER_INVALID'});
 const sprite={targets:[{isStage:true,blocks:{}},{isStage:false,blocks:{root:createEmbeddedYamlRootMarker(rootOptions)}}]};assert.throws(()=>installEmbeddedYamlRootMarker(sprite,rootOptions),{code:'ROOT_MARKER_INVALID'});
});
test('portable basenames allow Japanese and preserve exact spelling without implicit extension or rename',()=>{
 for(const name of ['台本.k4.yml','設定.yaml','my story.yml','é.yml','日本語😀.yaml','AUXiliary.yml'])assert.equal(validateEmbeddedYamlFilename(name),name);
 for(const name of ['', ' ','.','..','a.','a ', ' a.yml','a/b.yml','a\\b.yml','a:b.yml','a?b.yml','a\u0000.yml','a\u0080.yml','CON','nul.yaml','COM1.k4.yml','LPT².yaml','clock$.yaml','あ'.repeat(86)+'.yml','\ud800.yml'])assert.throws(()=>validateEmbeddedYamlFilename(name),{code:'DOCUMENT_FILENAME_INVALID'});
});
test('relative paths validate each portable component and reject normalization instead of silently rewriting',()=>{
 assert.equal(validateEmbeddedYamlRelativePath('章/はじめ.k4.yml'),'章/はじめ.k4.yml');
 for(const path of ['','/main.yaml','../main.yml','a/../main.yml','./main.yml','a//main.yml','a\\main.yml','a/','a/CON.yml','x'.repeat(1001)])assert.throws(()=>validateEmbeddedYamlRelativePath(path));
 assert.throws(()=>validateEmbeddedYamlFilename('章/main.yml'));assert.equal(validateEmbeddedYamlRelativePath('章/main.yml'),'章/main.yml');
});
