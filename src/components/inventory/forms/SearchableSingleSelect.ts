"use client";

import { createElement, useEffect } from "react";
import type { ComponentProps } from "react";

// This explicit extension intentionally targets the original implementation.
// Extensionless imports resolve to this mobile-safety wrapper first.
// @ts-expect-error Source-file extension is intentional for this wrapper.
import { SearchableSingleSelect as BaseSearchableSingleSelect } from "./SearchableSingle