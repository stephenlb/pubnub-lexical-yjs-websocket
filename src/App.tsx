/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
//import * as React from 'react';
//import {AutoFocusPlugin} from '@lexical/react/LexicalAutoFocusPlugin';
//import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {$getRoot, $createParagraphNode, $createTextNode} from 'lexical';
import * as Y from 'yjs';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {Provider} from '@lexical/yjs';
import {WebsocketProvider} from 'y-websocket';
import {CollaborationPlugin} from "@lexical/react/LexicalCollaborationPlugin";
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';

import PubNub from './PubNub';
import ExampleTheme from './ExampleTheme';
import ToolbarPlugin from './plugins/ToolbarPlugin';

/*function Placeholder() {
  return <div className="editor-placeholder"></div>;
}*/

const editorConfig = {
  editorState: null,
  namespace: 'documentID-223-policy-management-doc',
  //nodes: [],
  // Handling of errors during update
  onError(error: Error) {
    throw error;
  },
  // The editor theme
  theme: ExampleTheme,
};
const pubnubConfig = {
  endpoint: "wss://v6.pubnub3.com",
  channel: editorConfig.namespace,
  auth: '',
  username: 'user-' + Math.random().toString(36).substr(2, 4),
  userId: 'user-id-' + Math.random().toString(36).substr(2, 9),
  publishKey: 'pub-c-46752c06-6fcc-455c-8447-179714574e74',
  subscribeKey: 'sub-c-2c11d42e-12db-11e4-897a-02ee2ddab7fe',
};

// TODO Optionally load additional content
function initialEditorState(): void {
  const root = $getRoot();
  const paragraph = $createParagraphNode();
  const text = $createTextNode(''); 
  paragraph.append(text);
  root.append(paragraph);
}

export default function App() {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="editor-container">
        <ToolbarPlugin />
        <div id="yjs-collaboration-plugin-container" className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<span></span>}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <CollaborationPlugin
            // cursorColor="rgba(255, 0, 255, 0.5)"
            // cursorsContainerRef={document.getElementById('#yjs-collaboration-plugin-container')}
            // username={pubnubConfig.username}
            providerFactory={(id, yjsDocMap) => {
              const doc = new Y.Doc();
              yjsDocMap.set(id, doc);
              const provider = new WebsocketProvider(
                pubnubConfig.endpoint, id, doc, {
                  WebSocketPolyfill: PubNub as unknown as typeof WebSocket,
                  params: pubnubConfig,
              }) as unknown as Provider;
              return provider;
            }}
            id="yjs-collaboration-plugin"
            initialEditorState={initialEditorState}
            shouldBootstrap={false}
          />
        </div>
      </div>
    </LexicalComposer>
  );
}
