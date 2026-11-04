import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { InstructorLayout } from './components/InstructorLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './lib/auth'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import StudentSurvey from './pages/StudentSurvey'
import { Spinner } from './components/ui'

// Instructor pages (and their heavy chart/QR libraries) load on demand,
// keeping the student page small and fast on phones.
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const SurveyEditor = lazy(() => import('./pages/SurveyEditor'))
const Present = lazy(() => import('./pages/Present'))
const Results = lazy(() => import('./pages/Results'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/s/:slug" element={<StudentSurvey />} />
            <Route element={<ProtectedRoute />}>
              {/* Present is full-screen, without the instructor header. */}
              <Route path="/surveys/:id/present" element={<Present />} />
              <Route element={<InstructorLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/surveys/new" element={<SurveyEditor />} />
                <Route path="/surveys/:id/edit" element={<SurveyEditor />} />
                <Route path="/surveys/:id/results" element={<Results />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
