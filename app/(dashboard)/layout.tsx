import Header from "../components/Header";
import { BatchFilterProvider } from "../context/BatchFilterContext";
import { SectionTimerProvider } from "../context/SectionTimerContext";
import { BugReportProvider } from "../components/bug-report/BugReportContext";
import BugReportDialog from "../components/bug-report/BugReportDialog";

export default function DashboardLayout({children}: {children: React.ReactNode}) {
    return (
        <>
        <BugReportProvider>
        <BatchFilterProvider>
        <SectionTimerProvider>
        <Header />
        <BugReportDialog />
        {children}
        </SectionTimerProvider>
        </BatchFilterProvider>
        </BugReportProvider>
        </>
    )
}
