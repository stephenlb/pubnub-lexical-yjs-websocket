/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
//import {LexicalEditor} from '@lexical/react';
import * as React from 'react';

import {$getRoot, $createParagraphNode, $createTextNode} from 'lexical';
import {AutoFocusPlugin} from '@lexical/react/LexicalAutoFocusPlugin';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import * as Y from 'yjs';
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
  namespace: 'documentID-1-architecture-details',
  //nodes: [],
  // Handling of errors during update
  onError(error: Error) {
    throw error;
  },
  // The editor theme
  theme: {},
};
const pubnubConfig = {
  endpoint: "wss://v6.pubnub3.com",
  channel: editorConfig.namespace,
  auth: '',
  uuid: 'user-id-' + Math.random().toString(36).substr(2, 9),
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
        <div className="editor-inner">
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor-input" />}
            placeholder={<Placeholder />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <CollaborationPlugin
            id="yjs-collaboration-plugin"
            providerFactory={(id, yjsDocMap) => {
              const doc = new Y.Doc();
              yjsDocMap.set(id, doc);
              const provider = new WebsocketProvider(
                pubnubConfig.endpoint, id, doc, {
                  WebSocketPolyfill: PubNub,
                  params: pubnubConfig,
              });

              return provider;
            }}
            // Optional initial editor state in case collaborative Y.Doc won't
            // have any existing data on server. Then it'll user this value to populate editor. 
            // It accepts same type of values as LexicalComposer editorState
            // prop (json string, state object, or a function)
            initialEditorState={initialEditorState}
            shouldBootstrap={true}
          />
        </div>
      </div>
    </LexicalComposer>
  );
}
