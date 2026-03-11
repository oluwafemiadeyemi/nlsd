"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

export function ClientGreeting({ firstName }: { firstName: string }) {
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
    setDateStr(format(new Date(), "MMMM d, yyyy"));
  }, []);

  return (
    <>
      <h1 className="text-[34px] font-bold text-gray-900 leading-tight">
        {greeting ? `Good ${greeting} ${firstName}!` : `Hello ${firstName}!`}
      </h1>
      <div className="flex-1" />
      <div className="flex items-center gap-2 shrink-0">
        <span className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
          </svg>
          {dateStr || "\u00A0"}
        </span>
      </div>
    </>
  );
}
