"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  saveRequestConfiguration,
  type SaveRequestConfigurationResult,
} from "./actions";

export type RequestPolicyManagerPresentation = {
  id: string;
  label: string;
  inputUnitCode: string;
  qtyInStockUnit: number;
  imageUrl: string;
  usageContext: string;
};

export type RequestPolicyManagerSupplierOffer = {
  id: string;
  supplierName: string;
  supplierAlias: string;
  supplierSku: string;
  purchaseUnit: string;
  purchasePackQty: number | null;
  purchasePackUnitCode: string;
  isPrimary: boolean;
  uomProfileId: string | null;
};

export type RequestPolicyManagerProduct