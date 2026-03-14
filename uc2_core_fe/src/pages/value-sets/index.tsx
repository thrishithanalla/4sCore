import { Route, Routes } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from '../../store'
import { ThemeProvider } from '../../utils/theme'
import ValueSetForm from './value-set-form'
import ValueSetView from './value-set-view'
import ValueSetList from './value-sets-list'

const ValueSetsModule = () => {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<ValueSetList />} />
          <Route path="/form/:id" element={<ValueSetForm />} />
          <Route path="/view/:id" element={<ValueSetView />} />
        </Routes>
      </ThemeProvider>
    </Provider>
  )
}

export default ValueSetsModule