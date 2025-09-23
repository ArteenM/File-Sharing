interface HeaderProps
{
  onLogout: () => void
}

const Header: React.FC<HeaderProps> = ({onLogout}) =>
{

    const handleLogout = () =>
    {
        onLogout()
    }
    return (
        <header>
            <nav>
                <ul className="text-blue-600 hover:underline"> 
                    <button onClick={handleLogout}
                    className="bg-transparent border-none p-0">Logout</button>
                </ul>
            </nav>
        </header>
    )
}

export default Header