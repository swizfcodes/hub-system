import { useEffect, useState } from "react";

export interface Greeting {
  primary: string;
  secondary: string;
  period: "morning" | "afternoon" | "evening" | "night";
}

export function useGreeting(): { time: Date; greeting: Greeting } {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = time.getHours();
  let g: Greeting;
  if (h >= 5 && h < 12)
    g = {
      primary: "Good morning",
      secondary: "A fresh start — ready to build something beautiful",
      period: "morning",
    };
  else if (h >= 12 && h < 17)
    g = {
      primary: "Good afternoon",
      secondary: "The day is in full swing — momentum is everything",
      period: "afternoon",
    };
  else if (h >= 17 && h < 22)
    g = {
      primary: "Good evening",
      secondary: "The night is young — let’s get things done",
      period: "evening",
    };
  else
    g = {
      primary: "Working late",
      secondary: "The quiet hours — when craft happens",
      period: "night",
    };

  return { time, greeting: g };
}
