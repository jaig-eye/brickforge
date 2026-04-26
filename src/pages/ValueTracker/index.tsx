import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ValueTracker() {
  const navigate = useNavigate()

  // Value tracking is integrated into the Collection page — redirect there
  useEffect(() => {
    navigate('/collection', { replace: true })
  }, [navigate])

  return null
}
