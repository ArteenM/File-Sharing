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
                <ul className="header bg-white shadow flex justify-center"> 
                    <button onClick={handleLogout}
                    className="text-black py-2 px-4 disabled:cursor-not-allowed mt-4">Logout</button>
                </ul>
            </nav>
        </header>
    )
}

export default Header