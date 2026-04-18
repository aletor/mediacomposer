"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { NodeExecutionProvider } from "./NodeExecutionBridge";
import { SpacesContent } from "./SpacesContent";

export default function SpacesPage() {
  return (
    <div className="w-screen h-screen bg-slate-50">
      <ReactFlowProvider>
        <NodeExecutionProvider>
          <SpacesContent />
        </NodeExecutionProvider>
      </ReactFlowProvider>
    </div>
  );
}
