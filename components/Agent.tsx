"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants"; // Keep this import for the 'normal' type flow
import { createFeedback } from "@/lib/actions/general.action";

enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

interface AgentProps {
  userName: string;
  userId: string;
  interviewId?: string;
  feedbackId?: string;
  type: "generate" | "normal";
  questions?: string[];
}


const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>("");

  useEffect(() => {
    const onCallStart = () => {
      setCallStatus(CallStatus.ACTIVE);
    };

    const onCallEnd = () => {
      setCallStatus(CallStatus.FINISHED);
    };

    const onMessage = (message: any) => {
      if (
        message.type === "transcript" &&
        message.transcriptType === "final"
      ) {
        const newMessage = { role: message.role, content: message.transcript };
        setMessages((prev) => [...prev, newMessage]);
      }
    };

    const onSpeechStart = () => {
      setIsSpeaking(true);
    };

    const onSpeechEnd = () => {
      setIsSpeaking(false);
    };

    const onError = (error: Error) => {
      console.log("Error:", error);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      if (!interviewId || !userId) {
        console.error("Missing interviewId or userId for feedback generation.");
        router.push("/");
        return;
      }
      const { success, feedbackId: id } = await createFeedback({
        interviewId: interviewId,
        userId: userId,
        transcript: messages,
        feedbackId: feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/");
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);

    if (type === "generate") {
      const workflowIdToUse = process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID;

      if (!workflowIdToUse) {
        alert("Vapi Workflow ID must be provided to start the call for 'generate' type.");
        setCallStatus(CallStatus.INACTIVE);
        return;
      }

      try {
        // --- THIS IS THE CRITICAL MODIFICATION ---
        // Explicitly start the Vapi call using the workflowId, not the 'interviewer' Assistant object.
        await vapi.start({
          workflowId: workflowIdToUse, // This correctly targets your Vapi Workflow
          variableValues: {
            username: userName,
            userid: userId,
          },
          // You can still merge other Assistant properties if your workflow doesn't define them
          // and you want specific voice/model settings from your 'interviewer' constant.
          // For instance:
          // assistant: {
          //   model: interviewer.model,
          //   voice: interviewer.voice,
          //   // Do NOT include systemPrompt from interviewer if you want your Vapi Workflow's prompt to apply
          // }
        });
        // --- END OF CRITICAL MODIFICATION ---

      } catch (error: any) {
        alert(
          "Something went wrong: " +
            (error?.message || "Failed to start interview.")
        );
        setCallStatus(CallStatus.INACTIVE);
      }
      return;
    }

    // --- This part of the code is for 'normal' interview type, where `interviewer` (Assistant) is used ---
    // This is where the `interviewer` Assistant's system prompt and `{{questions}}` placeholder would be relevant.
    if (!interviewer) { // Note: 'interviewer' here is an object, not directly a falsy value. This check might need adjustment.
      alert("Assistant (interviewer) must be provided to start the call.");
      setCallStatus(CallStatus.INACTIVE);
      return;
    }

    let formattedQuestions = "";
    if (questions) {
      formattedQuestions = questions.map((question) => `- ${question}`).join("\n");
    }

    try {
      await vapi.start(interviewer, { // Here, passing the 'interviewer' Assistant object is appropriate
        variableValues: {
          questions: formattedQuestions,
        },
      });
    } catch (error: any) {
      alert(
        "Something went wrong: " +
          (error?.message || "Failed to start interview.")
      );
      setCallStatus(CallStatus.INACTIVE);
    }
  };

  const handleDisconnect = () => {
    setCallStatus(CallStatus.FINISHED);
    vapi.stop();
  };

  return (
    <>
      <div className="call-view">
        {/* AI Interviewer Card */}
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.png"
              alt="profile-image"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        {/* User Profile Card */}
        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.png"
              alt="profile-image"
              width={539}
              height={539}
              className="rounded-full object-cover size-[120px]"
            />
            <h3>{userName}</h3>
          </div>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="transcript-border">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex justify-center">
        {callStatus !== "ACTIVE" ? (
          <button className="relative btn-call" onClick={() => handleCall()}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== "CONNECTING" && "hidden"
              )}
            />

            <span className="relative">
              {callStatus === "INACTIVE" || callStatus === "FINISHED"
                ? "Call"
                : ". . ."}
            </span>
          </button>
        ) : (
          <button className="btn-disconnect" onClick={() => handleDisconnect()}>
            End
          </button>
        )}
      </div>
    </>
  );
};

export default Agent;
