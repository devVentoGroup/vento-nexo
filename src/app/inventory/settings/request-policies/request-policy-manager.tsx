"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { saveRequestConfiguration } from "./actions";

export type ManagerPresentation = {
  id: string;
  label: string;
  inputUnitCode: string;
  qtyInStockUnit: number;
  imageUrl: string;
};

export type ManagerSupplierOffer = {
  id: string;
  supplierName: string;
  supplierAlias: