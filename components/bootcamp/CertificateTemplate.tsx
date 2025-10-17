import React from "react";

export interface CertificateData {
  bootcampName: string;
  userName: string;
  completionDate: string;
  lockAddress: string;
}

interface CertificateTemplateProps {
  data: CertificateData;
  innerRef?: React.Ref<HTMLDivElement>;
}

export const CertificateTemplate: React.FC<CertificateTemplateProps> = ({
  data,
  innerRef,
}) => {
  return (
    <div
      ref={innerRef}
      className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
      style={{
        width: "1200px",
        height: "800px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Flame-themed border */}
      <div className="absolute inset-0 border-8 border-double border-flame-yellow opacity-80" />
      <div className="absolute inset-2 border-4 border-flame-orange opacity-60" />

      {/* Decorative corner flames */}
      <div className="absolute top-8 left-8 w-16 h-16 bg-gradient-to-br from-flame-yellow to-flame-orange rounded-full opacity-30 blur-xl" />
      <div className="absolute top-8 right-8 w-16 h-16 bg-gradient-to-br from-flame-yellow to-flame-orange rounded-full opacity-30 blur-xl" />
      <div className="absolute bottom-8 left-8 w-16 h-16 bg-gradient-to-br from-flame-yellow to-flame-orange rounded-full opacity-30 blur-xl" />
      <div className="absolute bottom-8 right-8 w-16 h-16 bg-gradient-to-br from-flame-yellow to-flame-orange rounded-full opacity-30 blur-xl" />

      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-20 py-16 text-center">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-flame-yellow via-flame-orange to-flame-yellow mb-2">
            Certificate of Completion
          </h1>
          <div className="h-1 w-64 mx-auto bg-gradient-to-r from-transparent via-flame-yellow to-transparent" />
        </div>

        {/* Body */}
        <div className="space-y-8 mb-12">
          <p className="text-2xl text-gray-300">This certifies that</p>
          <h2 className="text-5xl font-bold text-white">{data.userName}</h2>
          <p className="text-2xl text-gray-300">has successfully completed</p>
          <h3 className="text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-flame-yellow to-flame-orange">
            {data.bootcampName}
          </h3>
        </div>

        {/* Completion Date */}
        <div className="mb-8">
          <p className="text-lg text-gray-400">Completed on</p>
          <p className="text-2xl font-semibold text-gray-300 mt-1">
            {new Date(data.completionDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Lock Address */}
        <div className="mb-12">
          <p className="text-sm text-gray-400 mb-2">Certificate Lock Address</p>
          <div className="px-6 py-3 bg-gray-800/50 border border-gray-700 rounded-lg">
            <code className="text-lg font-mono text-flame-yellow break-all">
              {data.lockAddress}
            </code>
          </div>
        </div>

        {/* Footer - P2E Inferno Branding */}
        <div className="mt-auto">
          <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-flame-yellow to-flame-orange mb-1">
            P2E INFERNO
          </div>
          <div className="text-sm text-gray-400">
            Play-to-Earn Gaming Community
          </div>
        </div>
      </div>
    </div>
  );
};
