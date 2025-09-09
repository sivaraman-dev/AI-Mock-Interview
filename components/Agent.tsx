"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { vapi } from "@/lib/vapi.sdk";
import { interviewer } from "@/constants"; // Keep this if used elsewhere, but not directly for 'generate' flow
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

// Assuming AgentProps is defined elsewhere, no change needed here
interface AgentProps {
  userName: string;
  userId: string;
  interviewId: string | null;
  feedbackId: string | null;
  type: "generate" | "normal"; // Assuming 'type' can be 'generate' or 'normal'
  questions?: string[]; // Assuming 'questions' is an array of strings
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

    const onMessage = (message: any) => { // Use 'any' or define Vapi's Message type if available
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
      // Ensure interviewId is not null for createFeedback
      if (!interviewId) {
        console.error("Interview ID is null, cannot generate feedback.");
        router.push("/"); // Redirect if critical info is missing
        return;
      }
      const { success, feedbackId: id } = await createFeedback({
        interviewId: interviewId,
        userId: userId!, // Ensure userId is handled correctly, possibly non-null asserted or checked
        transcript: messages,
        feedbackId,
      });

      if (success && id) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        router.push("/");
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/"); // Redirect after generating (if that's the desired flow)
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const handleCall = async () => {
    setCallStatus(CallStatus.CONNECTING);

    if (type === "generate") {
      const workflowIdToUse = process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID;

      // --- CRITICAL CHANGE: Simplified check and vapi.start() call ---
      if (!workflowIdToUse) {
        alert("Vapi Workflow ID must be provided to start the call for 'generate' type.");
        setCallStatus(CallStatus.INACTIVE);
        return;
      }

      try {
        await vapi.start({ // Pass a single options object to vapi.start
          workflowId: workflowIdToUse, // Explicitly use the workflow ID
          variableValues: {
            username: userName,
            userid: userId,
            // (level, amount, techstack, role, type are collected by Vapi's workflow,
            // so they are NOT passed from here)
          },
        });
      } catch (error: any) {
        alert(
          "Something went wrong: " +
            (error?.message || "Failed to start interview.")
        );
        setCallStatus(CallStatus.INACTIVE);
      }
      return; // Exit the function after handling 'generate' type
    }

    // --- Original code for 'normal' interview type (unchanged, assuming it works for its purpose) ---
    if (!interviewer) {
      alert("Assistant (interviewer) must be provided to start the call.");
      setCallStatus(CallStatus.INACTIVE);
      return;
    }

    let formattedQuestions = "";
    if (questions) {
      formattedQuestions = questions.map((question) => `- ${question}`).join("\n");
    }

    try {
      await vapi.start(interviewer, {
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
