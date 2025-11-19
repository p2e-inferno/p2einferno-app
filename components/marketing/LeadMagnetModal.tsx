import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadMagnetForm, LeadMagnetFormProps } from "./LeadMagnetForm";

interface LeadMagnetModalProps extends LeadMagnetFormProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
}

export const LeadMagnetModal: React.FC<LeadMagnetModalProps> = ({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title = "Get the Onchain Starter Kit",
  description = "Enter your best email and we’ll send the kit and waitlist updates.",
  ...formProps
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <div onClick={() => handleOpenChange(true)}>{trigger}</div>}
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            {title}
          </DialogTitle>
          <p className="text-sm text-faded-grey mt-1">{description}</p>
        </DialogHeader>
        <LeadMagnetForm
          {...formProps}
          onSuccess={() => {
            formProps.onSuccess?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
