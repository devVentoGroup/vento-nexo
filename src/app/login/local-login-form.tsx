"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Props = {
  returnTo: string;
};

function safeLocalReturnTo(value: string): string {
  const fallback = "/";
  const target = String(value ?? "").trim();
  if (!target) return fallback;

  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}` || fallback