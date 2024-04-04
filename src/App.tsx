/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
//import * as React from 'react';
import * as Y from 'yjs';
import {$getRoot, $createParagraphNode, $createTextNode} from 'lexical';
//import {AutoFocusPlugin} from '@lexical/react/LexicalAutoFocusPlugin';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
//import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {Provider} from '@lexical/yjs';
import {WebsocketProvider} from 'y-websocket';
import {CollaborationPlugin} from "@lexical/react/LexicalCollaborationPlugin";

import PubNub from './PubNub';
import ExampleTheme from './ExampleTheme';
import ToolbarPlugin from './plugins/ToolbarPlugin';

function Placeholder() {
  return <div className="editor-placeholder">Loading...</div>;
}

const editorConfig = {
  editorState: null,
  namespace: 'documentID-3-policy-management-doc',
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
  publishKey: 'demo-36',
  subscribeKey: 'demo-36',
};

function initialEditorState(): void {
  const root = $getRoot();
  const paragraph = $createParagraphNode();

  // TODO Load initial content from server
  const text = $createTextNode('Hello, from PubNub!'); 
  // TODO Load initial content from server

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
            placeholder={<Placeholder />}
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
            shouldBootstrap={true}
          />
        </div>
      </div>
    </LexicalComposer>
  );
}
