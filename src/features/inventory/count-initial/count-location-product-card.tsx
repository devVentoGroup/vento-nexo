"use client";

import { memo } from "react";

import {
  hasExplicitCount,
  parseCountQuantity,
  resolveCountUnit,
  type CountLocationEntry,
  type CountLocationProduct,
  type CountUnitOption,
  type InternalPositionOption,
} from "./count-location-model";

type Props = {
  product: CountLocationProduct;
  entries: CountLocationEntry[];
  unitOptions: CountUnitOption[];
  positions: InternalPositionOption[];
  onQuantityChange: (entry